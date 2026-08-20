/**
 * App Store Server API client (sandbox). SERVER ONLY.
 *
 * Everything Apple tells us arrives as a JWS signed by Apple. This module
 * NEVER reads a payload it has not verified against the pinned Apple root, and
 * never accepts an environment other than the one this deployment runs as.
 *
 * Nothing here is user input: the transaction id passed in is either verified
 * from a signed payload or read back from our own database.
 */
import {
  appleStatusLifecycle,
  productFor,
  type StoreEnvironment,
  type StoreSnapshot,
} from "./store-core";
import { appleConfig, type AppleConfig } from "./store-env.server";
import { signAppleClientJwt, verifyAppleJws } from "./jws.server";

export type AppleFailure =
  | "NOT_CONFIGURED"
  | "CREDENTIAL_MISPLACED"
  | "INVALID_CREDENTIAL"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "UPSTREAM_ERROR"
  | "MALFORMED_RESPONSE"
  | "SIGNATURE_INVALID"
  | "WRONG_ENVIRONMENT"
  | "UNKNOWN_PRODUCT"
  | "UNSUPPORTED_STATE";

export type AppleResult =
  { ok: true; snapshot: StoreSnapshot } | { ok: false; reason: AppleFailure };

export type Fetcher = typeof fetch;

type SignedTransaction = {
  originalTransactionId?: unknown;
  productId?: unknown;
  environment?: unknown;
  purchaseDate?: unknown;
  expiresDate?: unknown;
  revocationDate?: unknown;
  bundleId?: unknown;
};

function isoFromMillis(value: unknown): string | null {
  const millis = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(millis) || millis <= 0) return null;
  return new Date(millis).toISOString();
}

function normalizeEnvironment(value: unknown): StoreEnvironment | null {
  const text = typeof value === "string" ? value.toLowerCase() : "";
  return text === "sandbox" || text === "production" ? text : null;
}

/**
 * Reads the authoritative subscription state for one original transaction id.
 * Used both to verify a purchase presented by the app and to reconcile.
 */
export async function fetchAppleSubscriptionState(
  originalTransactionId: string,
  options: { fetchImpl?: Fetcher; config?: AppleConfig; now?: number } = {},
): Promise<AppleResult> {
  let config = options.config;
  if (!config) {
    const resolved = appleConfig();
    if (!resolved.ok) return { ok: false, reason: resolved.reason };
    config = resolved.config;
  }

  if (!/^[A-Za-z0-9._-]{1,200}$/.test(originalTransactionId))
    return { ok: false, reason: "NOT_FOUND" };

  let token: string;
  try {
    token = await signAppleClientJwt({
      privateKeyPem: config.privateKeyPem,
      keyId: config.keyId,
      issuerId: config.issuerId,
      bundleId: config.bundleId,
      ...(options.now ? { now: options.now } : {}),
    });
  } catch {
    return { ok: false, reason: "INVALID_CREDENTIAL" };
  }

  const doFetch = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await doFetch(
      `${config.apiBase}/inApps/v1/subscriptions/${encodeURIComponent(originalTransactionId)}`,
      { method: "GET", headers: { authorization: `Bearer ${token}`, accept: "application/json" } },
    );
  } catch {
    return { ok: false, reason: "UPSTREAM_ERROR" };
  }

  if (response.status === 401 || response.status === 403)
    return { ok: false, reason: "UNAUTHORIZED" };
  if (response.status === 404) return { ok: false, reason: "NOT_FOUND" };
  if (response.status === 429) return { ok: false, reason: "RATE_LIMITED" };
  if (!response.ok) return { ok: false, reason: "UPSTREAM_ERROR" };

  let body: Record<string, unknown>;
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, reason: "MALFORMED_RESPONSE" };
  }

  return parseAppleSubscriptionResponse(body, config, options.now);
}

/** Pure parser + verifier for an App Store Server API subscription response. */
export async function parseAppleSubscriptionResponse(
  body: Record<string, unknown>,
  config: AppleConfig,
  now?: number,
): Promise<AppleResult> {
  const groups = Array.isArray(body["data"])
    ? (body["data"] as Array<Record<string, unknown>>)
    : [];
  const transactions = groups.flatMap((group) =>
    Array.isArray(group["lastTransactions"])
      ? (group["lastTransactions"] as Array<Record<string, unknown>>)
      : [],
  );
  const latest = transactions[0];
  if (!latest) return { ok: false, reason: "MALFORMED_RESPONSE" };

  const signed = latest["signedTransactionInfo"];
  if (typeof signed !== "string") return { ok: false, reason: "MALFORMED_RESPONSE" };

  const verified = await verifyAppleJws<SignedTransaction>(signed, {
    ...(config.trustedRootFingerprints.length
      ? { trustedRootFingerprints: config.trustedRootFingerprints }
      : {}),
    ...(now ? { now: new Date(now) } : {}),
  });
  if (!verified.ok) return { ok: false, reason: "SIGNATURE_INVALID" };
  const info = verified.payload;

  if (typeof info.bundleId === "string" && info.bundleId !== config.bundleId) {
    return { ok: false, reason: "WRONG_ENVIRONMENT" };
  }

  const environment = normalizeEnvironment(
    typeof body["environment"] === "string" ? body["environment"] : info.environment,
  );
  if (!environment || environment !== config.environment)
    return { ok: false, reason: "WRONG_ENVIRONMENT" };

  const purchaseRef =
    typeof info.originalTransactionId === "string" ? info.originalTransactionId : null;
  const productId = typeof info.productId === "string" ? info.productId : null;
  if (!purchaseRef || !productId) return { ok: false, reason: "MALFORMED_RESPONSE" };
  if (!productFor("apple", productId)) return { ok: false, reason: "UNKNOWN_PRODUCT" };

  const status = Number(latest["status"]);
  const renewalAutoRenew = await appleAutoRenew(latest, config, now);
  const lifecycle = appleStatusLifecycle(status, renewalAutoRenew);
  if (!lifecycle) return { ok: false, reason: "UNSUPPORTED_STATE" };

  const revoked = isoFromMillis(info.revocationDate);
  const finalLifecycle = revoked
    ? { status: "expired" as const, revoke: true, cancelAtPeriodEnd: false, reason: "api_revoked" }
    : lifecycle;

  const periodEnd = isoFromMillis(info.expiresDate);
  return {
    ok: true,
    snapshot: {
      store: "apple",
      purchaseRef,
      productId,
      environment,
      periodStart: isoFromMillis(info.purchaseDate),
      periodEnd,
      lifecycle: finalLifecycle,
      stateToken: `${status}:${finalLifecycle.reason}:${periodEnd ?? "none"}`,
    },
  };
}

/** Renewal info is optional; a missing/invalid one is treated as auto-renew on. */
async function appleAutoRenew(
  latest: Record<string, unknown>,
  config: AppleConfig,
  now?: number,
): Promise<boolean> {
  const signed = latest["signedRenewalInfo"];
  if (typeof signed !== "string") return true;
  const verified = await verifyAppleJws<{ autoRenewStatus?: unknown }>(signed, {
    ...(config.trustedRootFingerprints.length
      ? { trustedRootFingerprints: config.trustedRootFingerprints }
      : {}),
    ...(now ? { now: new Date(now) } : {}),
  });
  if (!verified.ok) return true;
  return Number(verified.payload.autoRenewStatus ?? 1) !== 0;
}
