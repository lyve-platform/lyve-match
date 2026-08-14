/**
 * Store authenticity verification. SERVER ONLY.
 *
 * Stage: SANDBOX. Production Apple / Google credentials are deliberately NOT
 * configured, so the production verifiers fail closed with NOT_CONFIGURED —
 * they never fall back to trusting the client.
 *
 * Two things are verified here and nowhere else:
 *   1. Notification authenticity (Apple ASSN V2 / Google RTDN) — the signature
 *      IS the authentication for the public webhook endpoints.
 *   2. Purchase authenticity (a receipt / purchase token presented by the app)
 *      before it may be bound to the authenticated LYVE account.
 *
 * A client can present any string; until one of these functions returns
 * `ok: true`, no purchase reference, product, period or status is trusted.
 *
 * SANDBOX ENVELOPE (test rail, mirrors the shape of the real ones):
 *   payload  = base64url(JSON)
 *   receipt  = `${payload}.${hex hmac_sha256(secret, payload)}`
 *   webhook  = raw JSON body + headers
 *              x-lyve-store-timestamp: <unix seconds>
 *              x-lyve-store-signature: sha256=<hex hmac(secret, `${ts}.${body}`)>
 * Without a secret there is no verification and nothing is processed.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  appleLifecycle,
  googleLifecycle,
  isStoreId,
  productFor,
  type StoreEnvironment,
  type StoreId,
  type VerifiedStoreEvent,
} from "./store-core";

export const STORE_SIGNATURE_HEADER = "x-lyve-store-signature";
export const STORE_TIMESTAMP_HEADER = "x-lyve-store-timestamp";
export const STORE_TIMESTAMP_TOLERANCE_SECONDS = 300;

export type StoreVerifyFailure =
  | "NOT_CONFIGURED"
  | "MISSING_SIGNATURE"
  | "INVALID_SIGNATURE"
  | "MISSING_TIMESTAMP"
  | "STALE_TIMESTAMP"
  | "MALFORMED_PAYLOAD"
  | "WRONG_ENVIRONMENT"
  | "UNSUPPORTED_EVENT"
  | "UNKNOWN_PRODUCT";

export type StoreMode = "disabled" | "sandbox" | "production";

/**
 * Production requires real store credentials. They are not connected in this
 * phase, so this can only ever return `sandbox` or `disabled` today.
 */
export function storeMode(): StoreMode {
  const appleReady = Boolean(process.env["APPLE_IAP_ISSUER_ID"] && process.env["APPLE_IAP_PRIVATE_KEY"]);
  const googleReady = Boolean(process.env["GOOGLE_PLAY_SERVICE_ACCOUNT_JSON"]);
  if (appleReady || googleReady) return "production";
  return storeSecret() ? "sandbox" : "disabled";
}

export function storeSecret(): string | null {
  const secret = process.env["STORE_SANDBOX_SECRET"] ?? process.env["BILLING_WEBHOOK_SECRET"];
  return secret && secret.length >= 16 ? secret : null;
}

export function signSandboxPayload(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function signSandboxWebhook(secret: string, timestamp: number, rawBody: string): string {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")}`;
}

/** Builds a sandbox receipt the mobile client would present after purchase. */
export function buildSandboxReceipt(secret: string, claims: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  return `${payload}.${signSandboxPayload(secret, payload)}`;
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function str(value: unknown, max = 400): string | null {
  return typeof value === "string" && value.trim() && value.length <= max ? value.trim() : null;
}

function iso(value: unknown): string | null {
  const text = typeof value === "string" ? value : null;
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function environment(value: unknown): StoreEnvironment | null {
  if (value === "sandbox" || value === "production") return value;
  return null;
}

/* ------------------------------------------------------------------ */
/* 1. Purchase authenticity (app → server, before account binding)      */
/* ------------------------------------------------------------------ */

export type VerifiedPurchase = {
  store: StoreId;
  /** Apple originalTransactionId / Google purchaseToken. */
  purchaseRef: string;
  productId: string;
  planCode: string;
  environment: StoreEnvironment;
  periodStart: string | null;
  periodEnd: string | null;
};

export type PurchaseVerification =
  | { ok: true; purchase: VerifiedPurchase }
  | { ok: false; reason: StoreVerifyFailure };

/**
 * Verifies a purchase presented by the app.
 *
 * The LYVE account is NOT an input here on purpose: authenticity and
 * ownership are separate steps. The caller binds the verified purchase to the
 * SESSION user, never to a user id supplied alongside the receipt.
 */
export async function verifyStorePurchase(
  store: unknown,
  receipt: unknown,
): Promise<PurchaseVerification> {
  if (!isStoreId(store)) return { ok: false, reason: "MALFORMED_PAYLOAD" };

  const mode = storeMode();
  // Production verification (App Store Server API / Google Play Developer API)
  // is intentionally unimplemented until credentials are provisioned.
  if (mode !== "sandbox") return { ok: false, reason: "NOT_CONFIGURED" };

  const secret = storeSecret();
  if (!secret) return { ok: false, reason: "NOT_CONFIGURED" };

  const token = typeof receipt === "string" ? receipt : "";
  const dot = token.indexOf(".");
  if (dot <= 0 || token.length > 8_000) return { ok: false, reason: "MALFORMED_PAYLOAD" };

  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!signature) return { ok: false, reason: "MISSING_SIGNATURE" };
  if (!safeEqual(signature, signSandboxPayload(secret, payload))) {
    return { ok: false, reason: "INVALID_SIGNATURE" };
  }

  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return { ok: false, reason: "MALFORMED_PAYLOAD" };
  }

  if (claims["store"] !== store) return { ok: false, reason: "MALFORMED_PAYLOAD" };

  const purchaseRef = str(claims["purchase_ref"]);
  const productId = str(claims["product_id"], 200);
  const env = environment(claims["environment"]);
  if (!purchaseRef || !productId || !env) return { ok: false, reason: "MALFORMED_PAYLOAD" };

  // A sandbox receipt may never claim production. Production receipts require
  // production credentials, which do not exist in this phase.
  if (env !== "sandbox") return { ok: false, reason: "WRONG_ENVIRONMENT" };

  const product = productFor(store, productId);
  if (!product) return { ok: false, reason: "UNKNOWN_PRODUCT" };

  return {
    ok: true,
    purchase: {
      store,
      purchaseRef,
      productId,
      planCode: product.planCode,
      environment: env,
      periodStart: iso(claims["period_start"]),
      periodEnd: iso(claims["period_end"]),
    },
  };
}

/* ------------------------------------------------------------------ */
/* 2. Notification authenticity (Apple ASSN V2 / Google RTDN)           */
/* ------------------------------------------------------------------ */

export type StoreEventVerification =
  | { ok: true; event: VerifiedStoreEvent }
  | { ok: false; reason: StoreVerifyFailure };

export async function verifyStoreNotification(
  store: StoreId,
  rawBody: string,
  headers: Headers,
): Promise<StoreEventVerification> {
  const mode = storeMode();
  if (mode !== "sandbox") return { ok: false, reason: "NOT_CONFIGURED" };

  const secret = storeSecret();
  if (!secret) return { ok: false, reason: "NOT_CONFIGURED" };

  const signature = headers.get(STORE_SIGNATURE_HEADER);
  if (!signature) return { ok: false, reason: "MISSING_SIGNATURE" };

  const timestampHeader = headers.get(STORE_TIMESTAMP_HEADER);
  const timestamp = Number(timestampHeader);
  if (!timestampHeader || !Number.isFinite(timestamp)) return { ok: false, reason: "MISSING_TIMESTAMP" };

  const skew = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
  if (skew > STORE_TIMESTAMP_TOLERANCE_SECONDS) return { ok: false, reason: "STALE_TIMESTAMP" };

  if (!safeEqual(signature, signSandboxWebhook(secret, timestamp, rawBody))) {
    return { ok: false, reason: "INVALID_SIGNATURE" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { ok: false, reason: "MALFORMED_PAYLOAD" };
  }

  return store === "apple" ? normalizeAppleEvent(parsed) : normalizeGoogleEvent(parsed);
}

/** Apple App Store Server Notification V2 (decoded payload shape). */
export function normalizeAppleEvent(parsed: unknown): StoreEventVerification {
  if (!parsed || typeof parsed !== "object") return { ok: false, reason: "MALFORMED_PAYLOAD" };
  const body = parsed as Record<string, unknown>;
  const data = (body["data"] ?? {}) as Record<string, unknown>;

  const eventId = str(body["notificationUUID"], 200);
  const type = str(body["notificationType"], 100);
  const subtype = str(body["subtype"], 100);
  const purchaseRef = str(data["originalTransactionId"]);
  const productId = str(data["productId"], 200);
  const env = environment(
    typeof data["environment"] === "string"
      ? String(data["environment"]).toLowerCase()
      : data["environment"],
  );

  if (!eventId || !type || !purchaseRef || !productId || !env) {
    return { ok: false, reason: "MALFORMED_PAYLOAD" };
  }
  if (env !== "sandbox") return { ok: false, reason: "WRONG_ENVIRONMENT" };
  if (!productFor("apple", productId)) return { ok: false, reason: "UNKNOWN_PRODUCT" };

  const lifecycle = appleLifecycle(type, subtype);
  if (!lifecycle) return { ok: false, reason: "UNSUPPORTED_EVENT" };

  return {
    ok: true,
    event: {
      store: "apple",
      eventId,
      eventType: subtype ? `${type}:${subtype}` : type,
      eventAt: iso(body["signedDate"]) ?? new Date().toISOString(),
      purchaseRef,
      productId,
      environment: env,
      periodStart: iso(data["purchaseDate"]),
      periodEnd: iso(data["expiresDate"]),
      lifecycle,
    },
  };
}

/** Google sends epoch milliseconds as a string. */
function googleEventTime(value: unknown): string {
  const millis = Number(value);
  if (Number.isFinite(millis) && millis > 0) return new Date(millis).toISOString();
  return iso(value) ?? new Date().toISOString();
}

/** Google Real-Time Developer Notification (decoded message shape). */
export function normalizeGoogleEvent(parsed: unknown): StoreEventVerification {
  if (!parsed || typeof parsed !== "object") return { ok: false, reason: "MALFORMED_PAYLOAD" };
  const body = parsed as Record<string, unknown>;
  const sub = (body["subscriptionNotification"] ?? {}) as Record<string, unknown>;

  const eventId = str(body["messageId"], 200);
  const purchaseRef = str(sub["purchaseToken"]);
  const productId = str(sub["subscriptionId"], 200);
  const notificationType = Number(sub["notificationType"]);
  const env = environment(
    typeof body["environment"] === "string" ? String(body["environment"]).toLowerCase() : "sandbox",
  );

  if (!eventId || !purchaseRef || !productId || !Number.isInteger(notificationType) || !env) {
    return { ok: false, reason: "MALFORMED_PAYLOAD" };
  }
  if (env !== "sandbox") return { ok: false, reason: "WRONG_ENVIRONMENT" };
  if (!productFor("google", productId)) return { ok: false, reason: "UNKNOWN_PRODUCT" };

  const lifecycle = googleLifecycle(notificationType);
  if (!lifecycle) return { ok: false, reason: "UNSUPPORTED_EVENT" };

  return {
    ok: true,
    event: {
      store: "google",
      eventId,
      eventType: `google:${notificationType}`,
      eventAt: googleEventTime(body["eventTimeMillis"]),
      purchaseRef,
      productId,
      environment: env,
      periodStart: iso(sub["startTime"]),
      periodEnd: iso(sub["expiryTime"]),
      lifecycle,
    },
  };
}
