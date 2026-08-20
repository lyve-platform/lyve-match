/**
 * Google Play Developer API client + RTDN envelope handling (sandbox).
 * SERVER ONLY.
 *
 * Two independent trust steps, both fail-closed:
 *   1. The Pub/Sub push request is authenticated by its OIDC bearer token
 *      (signed by Google, audience + service account pinned). The message body
 *      is NOT trusted before that.
 *   2. Whatever the message claims is then re-read from the Play Developer API
 *      using the purchase token — the API answer is the authority, not the push.
 */
import {
  googleStateLifecycle,
  productFor,
  type StoreEnvironment,
  type StoreSnapshot,
} from "./store-core";
import { googleConfig, type GoogleConfig } from "./store-env.server";
import { b64uToBytes, signGoogleServiceJwt, verifyGoogleOidcToken } from "./jws.server";

const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const ANDROID_PUBLISHER_SCOPE = "https://www.googleapis.com/auth/androidpublisher";

export type Fetcher = typeof fetch;

export type GoogleFailure =
  | "NOT_CONFIGURED"
  | "CREDENTIAL_MISPLACED"
  | "INVALID_CREDENTIAL"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "UPSTREAM_ERROR"
  | "MALFORMED_RESPONSE"
  | "WRONG_ENVIRONMENT"
  | "UNKNOWN_PRODUCT"
  | "UNSUPPORTED_STATE";

export type GoogleResult =
  { ok: true; snapshot: StoreSnapshot } | { ok: false; reason: GoogleFailure };

/* ------------------------------------------------------------------ */
/* Pub/Sub push envelope                                               */
/* ------------------------------------------------------------------ */

export type PushFailure =
  "PUSH_NOT_CONFIGURED" | "MISSING_TOKEN" | "INVALID_TOKEN" | "MALFORMED_ENVELOPE";

export type PushResult =
  | { ok: true; message: Record<string, unknown>; messageId: string }
  | { ok: false; reason: PushFailure };

/** Structural decode of the Pub/Sub envelope. Authentication happens first. */
export function decodePubSubEnvelope(rawBody: string): PushResult {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return { ok: false, reason: "MALFORMED_ENVELOPE" };
  }
  const message = parsed["message"];
  if (!message || typeof message !== "object") return { ok: false, reason: "MALFORMED_ENVELOPE" };
  const envelope = message as Record<string, unknown>;
  const data = envelope["data"];
  const messageId = envelope["messageId"];
  if (typeof data !== "string" || typeof messageId !== "string" || !messageId) {
    return { ok: false, reason: "MALFORMED_ENVELOPE" };
  }
  try {
    const decoded = JSON.parse(new TextDecoder().decode(b64uToBytes(data))) as Record<
      string,
      unknown
    >;
    if (!decoded || typeof decoded !== "object") return { ok: false, reason: "MALFORMED_ENVELOPE" };
    return { ok: true, message: decoded, messageId };
  } catch {
    return { ok: false, reason: "MALFORMED_ENVELOPE" };
  }
}

/**
 * Authenticates a Pub/Sub push request. Without a configured audience and
 * service account there is nothing to check against, so we refuse.
 */
export async function authenticatePubSubPush(
  headers: Headers,
  options: {
    config?: GoogleConfig;
    fetchImpl?: Fetcher;
    jwks?: { keys: Array<Record<string, unknown>> };
    now?: number;
  } = {},
): Promise<{ ok: true } | { ok: false; reason: PushFailure }> {
  let config = options.config;
  if (!config) {
    const resolved = googleConfig();
    if (!resolved.ok) return { ok: false, reason: "PUSH_NOT_CONFIGURED" };
    config = resolved.config;
  }
  if (!config.pushAudience || !config.pushServiceAccountEmail) {
    return { ok: false, reason: "PUSH_NOT_CONFIGURED" };
  }

  const authorization = headers.get("authorization");
  const token = authorization?.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : null;
  if (!token) return { ok: false, reason: "MISSING_TOKEN" };

  let jwks = options.jwks;
  if (!jwks) {
    try {
      const response = await (options.fetchImpl ?? fetch)(GOOGLE_JWKS_URL, { method: "GET" });
      if (!response.ok) return { ok: false, reason: "INVALID_TOKEN" };
      jwks = (await response.json()) as { keys: Array<Record<string, unknown>> };
    } catch {
      return { ok: false, reason: "INVALID_TOKEN" };
    }
  }

  const verified = await verifyGoogleOidcToken(token, {
    jwks,
    audience: config.pushAudience,
    serviceAccountEmail: config.pushServiceAccountEmail,
    ...(options.now ? { now: options.now } : {}),
  });
  return verified.ok ? { ok: true } : { ok: false, reason: "INVALID_TOKEN" };
}

/* ------------------------------------------------------------------ */
/* Play Developer API                                                  */
/* ------------------------------------------------------------------ */

export async function googleAccessToken(
  config: GoogleConfig,
  options: { fetchImpl?: Fetcher; now?: number } = {},
): Promise<{ ok: true; token: string } | { ok: false; reason: GoogleFailure }> {
  let assertion: string;
  try {
    assertion = await signGoogleServiceJwt({
      privateKeyPem: config.privateKeyPem,
      clientEmail: config.clientEmail,
      scope: ANDROID_PUBLISHER_SCOPE,
      ...(options.now ? { now: options.now } : {}),
    });
  } catch {
    return { ok: false, reason: "INVALID_CREDENTIAL" };
  }

  try {
    const response = await (options.fetchImpl ?? fetch)(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }).toString(),
    });
    if (response.status === 400 || response.status === 401)
      return { ok: false, reason: "UNAUTHORIZED" };
    if (!response.ok) return { ok: false, reason: "UPSTREAM_ERROR" };
    const body = (await response.json()) as { access_token?: unknown };
    const token = typeof body.access_token === "string" ? body.access_token : null;
    return token ? { ok: true, token } : { ok: false, reason: "MALFORMED_RESPONSE" };
  } catch {
    return { ok: false, reason: "UPSTREAM_ERROR" };
  }
}

/** Authoritative read of one purchase token via `purchases.subscriptionsv2`. */
export async function fetchGoogleSubscriptionState(
  purchaseToken: string,
  options: { fetchImpl?: Fetcher; config?: GoogleConfig; now?: number; accessToken?: string } = {},
): Promise<GoogleResult> {
  let config = options.config;
  if (!config) {
    const resolved = googleConfig();
    if (!resolved.ok) return { ok: false, reason: resolved.reason };
    config = resolved.config;
  }
  if (!purchaseToken || purchaseToken.length > 4000) return { ok: false, reason: "NOT_FOUND" };

  let accessToken = options.accessToken;
  if (!accessToken) {
    const issued = await googleAccessToken(config, options);
    if (!issued.ok) return { ok: false, reason: issued.reason };
    accessToken = issued.token;
  }

  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(
      `${config.apiBase}/androidpublisher/v3/applications/${encodeURIComponent(config.packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`,
      {
        method: "GET",
        headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
      },
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

  return parseGoogleSubscriptionResponse(body, purchaseToken, config);
}

function iso(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Play reports `testPurchase` for licence/sandbox purchases. */
function playEnvironment(body: Record<string, unknown>): StoreEnvironment {
  return body["testPurchase"] !== undefined ? "sandbox" : "production";
}

export function parseGoogleSubscriptionResponse(
  body: Record<string, unknown>,
  purchaseToken: string,
  config: GoogleConfig,
): GoogleResult {
  const items = Array.isArray(body["lineItems"])
    ? (body["lineItems"] as Array<Record<string, unknown>>)
    : [];
  const item = items[0];
  const productId =
    (item && typeof item["productId"] === "string" ? item["productId"] : null) ??
    (typeof body["productId"] === "string" ? body["productId"] : null);
  const state = typeof body["subscriptionState"] === "string" ? body["subscriptionState"] : null;
  if (!productId || !state) return { ok: false, reason: "MALFORMED_RESPONSE" };
  if (!productFor("google", productId)) return { ok: false, reason: "UNKNOWN_PRODUCT" };

  const environment = playEnvironment(body);
  if (environment !== config.environment) return { ok: false, reason: "WRONG_ENVIRONMENT" };

  const autoRenew =
    item && typeof item["autoRenewingPlan"] === "object" && item["autoRenewingPlan"] !== null
      ? (item["autoRenewingPlan"] as Record<string, unknown>)["autoRenewEnabled"] !== false
      : true;

  const lifecycle = googleStateLifecycle(state, autoRenew);
  if (!lifecycle) return { ok: false, reason: "UNSUPPORTED_STATE" };

  const periodEnd = iso(item?.["expiryTime"]) ?? iso(body["expiryTime"]);
  const finalLifecycle =
    body["subscriptionState"] === "SUBSCRIPTION_STATE_EXPIRED" && body["revoked"] === true
      ? {
          status: "expired" as const,
          revoke: true,
          cancelAtPeriodEnd: false,
          reason: "api_revoked",
        }
      : lifecycle;

  return {
    ok: true,
    snapshot: {
      store: "google",
      purchaseRef: purchaseToken,
      productId,
      environment,
      periodStart: iso(body["startTime"]),
      periodEnd,
      lifecycle: finalLifecycle,
      stateToken: `${state}:${finalLifecycle.reason}:${periodEnd ?? "none"}`,
    },
  };
}
