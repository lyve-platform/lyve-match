/**
 * Provider webhook processor. Server-only.
 *
 * Order of operations is the security design:
 *   1. resolve the adapter (provider identification)
 *   2. verify signature + timestamp (replay protection)  ← nothing is trusted before this
 *   3. validate payload and event type
 *   4. claim the event id in `billing_events` (unique index = atomic idempotency)
 *   5. apply the lifecycle transition through the database routine
 *   6. record the outcome on the ledger row
 *
 * The request body may claim any user id, status or entitlement — none of it is
 * acted on until step 2 succeeds, and even then the *database* decides what a
 * status means for access. Only safe metadata is persisted: no raw payload, no
 * signature, no card data, no provider secrets.
 */
import type { BillingProviderId } from "@/config/billing";
import type { Database } from "@/integrations/supabase/types";
import { mapEventToLifecycle, type NormalizedBillingEvent } from "@/lib/billing-core";
import { applySubscriptionState, revokeSubscriptionEntitlements } from "@/lib/billing.server";
import { configuredProviderId, resolveProvider, webhookSecret } from "./resolver";
import { BILLING_PROVIDERS } from "@/config/billing";

export const PROVIDER_HEADER = "x-lyve-billing-provider";

export type WebhookOutcome = {
  status: number;
  body: { received: boolean; result: string };
};

function respond(status: number, result: string): WebhookOutcome {
  return { status, body: { received: status < 400, result } };
}

function requestedProviderId(headers: Headers): BillingProviderId | null {
  const raw = headers.get(PROVIDER_HEADER);
  if (!raw) return null;
  return (BILLING_PROVIDERS as readonly string[]).includes(raw) ? (raw as BillingProviderId) : null;
}

/** Only ever safe, non-identifying operational metadata. */
function safeSummary(event: NormalizedBillingEvent) {
  return {
    plan_code: event.planCode,
    interval: event.interval,
    currency: event.currency,
    cancel_at_period_end: event.cancelAtPeriodEnd,
    period_end: event.periodEnd,
    provider_event_created_at: event.createdAt,
  };
}

export async function handleBillingWebhook(
  rawBody: string,
  headers: Headers,
): Promise<WebhookOutcome> {
  const active = configuredProviderId();
  const requested = requestedProviderId(headers);

  // A provider header that disagrees with the deployment is never processed.
  if (requested && requested !== active) return respond(400, "PROVIDER_MISMATCH");

  const provider = resolveProvider(active);
  if (!provider.supportsWebhooks) return respond(503, "BILLING_NOT_CONNECTED");

  const secret = webhookSecret();
  if (!secret) return respond(503, "WEBHOOK_NOT_CONFIGURED");

  if (rawBody.length > 64_000) return respond(413, "PAYLOAD_TOO_LARGE");

  const verification = await provider.verifyWebhook({ rawBody, headers, secret });
  if (!verification.ok) {
    const unauthorized =
      verification.reason === "MISSING_SIGNATURE" ||
      verification.reason === "INVALID_SIGNATURE" ||
      verification.reason === "MISSING_TIMESTAMP" ||
      verification.reason === "STALE_TIMESTAMP";
    // The reason code is a fixed enum: it leaks no signature and no payload.
    return respond(unauthorized ? 401 : 400, verification.reason);
  }

  const event = verification.event;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Step 4 — atomically claim the provider event id. The unique index on
  // (provider, provider_event_id) makes concurrent duplicates safe.
  const { data: claim, error: claimError } = await supabaseAdmin
    .from("billing_events")
    .insert({
      provider: provider.id as Database["public"]["Enums"]["billing_provider"],
      provider_event_id: event.id,
      event_type: event.type,
      status: "received",
      signature_verified: true,
      profile_id: event.profileId,
      event_created_at: event.createdAt,
      payload_summary: safeSummary(event),
    })
    .select("id")
    .single();

  if (claimError) {
    if (claimError.code === "23505") return respond(200, "DUPLICATE_IGNORED");
    console.error("[billing] ledger insert failed", { code: claimError.code });
    return respond(500, "LEDGER_UNAVAILABLE");
  }

  const eventRowId = claim.id;

  try {
    const outcome = mapEventToLifecycle(event);

    if (outcome.action === "revoke") {
      await revokeSubscriptionEntitlements(
        provider.id as Database["public"]["Enums"]["billing_provider"],
        event.subscriptionRef,
        outcome.reason,
      );
    } else {
      await applySubscriptionState({
        profileId: event.profileId,
        provider: provider.id as Database["public"]["Enums"]["billing_provider"],
        providerSubscriptionId: event.subscriptionRef,
        planCode: event.planCode,
        status: outcome.status,
        interval: event.interval,
        currency: event.currency,
        periodStart: event.periodStart,
        periodEnd: event.periodEnd,
        cancelAtPeriodEnd: event.cancelAtPeriodEnd || outcome.status === "canceled",
        source: "web",
      });
    }

    await supabaseAdmin
      .from("billing_events")
      .update({ status: "processed", processed_at: new Date().toISOString() })
      .eq("id", eventRowId);

    return respond(200, "PROCESSED");
  } catch (error) {
    // Operational metadata only — never the provider payload or error body.
    console.error("[billing] event processing failed", {
      provider: provider.id,
      event_type: event.type,
    });
    await supabaseAdmin
      .from("billing_events")
      .update({ status: "failed", error: "PROCESSING_FAILED", processed_at: new Date().toISOString() })
      .eq("id", eventRowId);
    void error;
    return respond(500, "PROCESSING_FAILED");
  }
}
