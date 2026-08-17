/**
 * Store notification processor (Apple ASSN V2 / Google RTDN). SERVER ONLY.
 *
 * Order of operations is the security design:
 *   1. throttle the endpoint (public, hostile surface; limiter failure = deny)
 *   2. verify authenticity (signature + freshness)  ← nothing trusted before this
 *   3. normalise into the LYVE lifecycle vocabulary
 *   4. claim the store event id in `billing_events` (unique index = idempotency)
 *   5. apply through the database routine, which refuses out-of-order events
 *
 * Store notifications never carry a LYVE user id. Access changes are applied
 * to the account that owns the purchase reference, established at link time.
 *
 * Observability never leaks: only the store, a stable failure code and a
 * truncated digest of the purchase reference are ever recorded.
 */
import type { StoreId } from "./store-core";
import { applyVerifiedStoreEvent } from "./store.server";
import { verifyStoreNotification } from "./store-verify.server";
import { consumeRate, raiseStoreAlert, refDigest, RATE_LIMITS } from "./store-ops.server";

export type StoreWebhookOutcome = {
  status: number;
  body: { received: boolean; result: string };
};

function respond(status: number, result: string): StoreWebhookOutcome {
  return { status, body: { received: status < 400, result } };
}

/** Coarse client identity for throttling. Never stored in the clear. */
function callerKey(store: StoreId, headers: Headers): string {
  const forwarded = headers.get("cf-connecting-ip") ?? headers.get("x-forwarded-for") ?? "unknown";
  return `webhook:${store}:${refDigest(forwarded.split(",")[0]!.trim())}`;
}

const UNAUTHORIZED_REASONS = new Set([
  "MISSING_SIGNATURE",
  "INVALID_SIGNATURE",
  "MISSING_TIMESTAMP",
  "STALE_TIMESTAMP",
]);

export async function handleStoreNotification(
  store: StoreId,
  rawBody: string,
  headers: Headers,
): Promise<StoreWebhookOutcome> {
  if (rawBody.length > 64_000) return respond(413, "PAYLOAD_TOO_LARGE");

  const key = callerKey(store, headers);
  const rate = await consumeRate(key, RATE_LIMITS.webhook);
  if (!rate.allowed) {
    await raiseStoreAlert("store_rate_limited", key, { store, hits: rate.hits, reason: "webhook_flood" });
    return respond(429, "RATE_LIMITED");
  }

  const verification = await verifyStoreNotification(store, rawBody, headers);
  if (!verification.ok) {
    // Authentic store connectivity probe — acknowledge, apply nothing.
    if (verification.reason === "TEST_NOTIFICATION") return respond(200, "TEST_OK");
    if (verification.reason === "NOT_CONFIGURED") return respond(503, "STORE_NOT_CONNECTED");

    if (verification.reason === "MISCONFIGURED") {
      await raiseStoreAlert("store_misconfiguration", `webhook:${store}`, { store, reason: "credentials_misplaced" });
      return respond(503, "STORE_NOT_CONNECTED");
    }
    if (verification.reason === "UPSTREAM_UNAVAILABLE") {
      // Tell the store to retry rather than dropping a real event.
      return respond(503, "UPSTREAM_UNAVAILABLE");
    }

    const unauthorized = UNAUTHORIZED_REASONS.has(verification.reason);
    if (unauthorized) {
      // A burst of bad signatures is the signal that matters most here.
      const failures = await consumeRate(`${key}:bad`, RATE_LIMITS.webhookFailure);
      await raiseStoreAlert("store_signature_failure", key, {
        store,
        reason: verification.reason,
        hits: failures.hits,
      });
    }
    return respond(unauthorized ? 401 : 400, verification.reason);
  }

  try {
    const result = await applyVerifiedStoreEvent(verification.event);
    return respond(200, result);
  } catch {
    // Operational metadata only — never the store payload.
    console.error("[store] notification processing failed", { store });
    await raiseStoreAlert("store_processing_failure", `webhook:${store}`, {
      store,
      reason: "apply_failed",
      ref_digest: refDigest(verification.event.purchaseRef),
    });
    return respond(500, "PROCESSING_FAILED");
  }
}
