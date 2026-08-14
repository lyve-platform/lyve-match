/**
 * Store notification processor (Apple ASSN V2 / Google RTDN). SERVER ONLY.
 *
 * Order of operations is the security design:
 *   1. verify authenticity (signature + freshness)  ← nothing trusted before this
 *   2. normalise into the LYVE lifecycle vocabulary
 *   3. claim the store event id in `billing_events` (unique index = idempotency)
 *   4. apply through the database routine, which refuses out-of-order events
 *
 * Store notifications never carry a LYVE user id. Access changes are applied
 * to the account that owns the purchase reference, established at link time.
 */
import type { StoreId } from "./store-core";
import { applyVerifiedStoreEvent } from "./store.server";
import { verifyStoreNotification } from "./store-verify.server";

export type StoreWebhookOutcome = {
  status: number;
  body: { received: boolean; result: string };
};

function respond(status: number, result: string): StoreWebhookOutcome {
  return { status, body: { received: status < 400, result } };
}

export async function handleStoreNotification(
  store: StoreId,
  rawBody: string,
  headers: Headers,
): Promise<StoreWebhookOutcome> {
  if (rawBody.length > 64_000) return respond(413, "PAYLOAD_TOO_LARGE");

  const verification = await verifyStoreNotification(store, rawBody, headers);
  if (!verification.ok) {
    const unauthorized =
      verification.reason === "MISSING_SIGNATURE" ||
      verification.reason === "INVALID_SIGNATURE" ||
      verification.reason === "MISSING_TIMESTAMP" ||
      verification.reason === "STALE_TIMESTAMP";
    if (verification.reason === "NOT_CONFIGURED") return respond(503, "STORE_NOT_CONNECTED");
    return respond(unauthorized ? 401 : 400, verification.reason);
  }

  try {
    const result = await applyVerifiedStoreEvent(verification.event);
    return respond(200, result);
  } catch {
    // Operational metadata only — never the store payload.
    console.error("[store] notification processing failed", { store });
    return respond(500, "PROCESSING_FAILED");
  }
}
