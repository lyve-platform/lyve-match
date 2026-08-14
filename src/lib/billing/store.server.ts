/**
 * Store purchase binding and lifecycle application. SERVER ONLY.
 *
 * Ownership rule (the core Phase 6 security property):
 *   A verified Apple transaction or Google purchase token is bound to the
 *   LYVE account taken from the VERIFIED SESSION. The purchase reference is
 *   unique across the platform, so a purchase already bound to account A can
 *   never be re-bound to account B — regardless of what any client sends.
 *
 * Idempotency: every store notification is claimed in `billing_events` by its
 * store-issued id before any state changes. Ordering: the database refuses to
 * apply an event older than the newest one already applied to that purchase.
 */
import type { Database } from "@/integrations/supabase/types";
import { entitlementsForPlan } from "@/lib/billing.server";
import { productFor, type StoreEventResult, type StoreId, type StoreLinkResult, type VerifiedStoreEvent } from "./store-core";
import { verifyStorePurchase } from "./store-verify.server";

type Provider = Database["public"]["Enums"]["billing_provider"];
type Interval = Database["public"]["Enums"]["billing_interval"];
type Status = Database["public"]["Enums"]["subscription_status"];

/**
 * Binds a verified store purchase to the AUTHENTICATED account.
 *
 * @param profileId MUST come from the verified session (context.userId).
 */
export async function linkVerifiedPurchase(
  profileId: string,
  store: StoreId,
  receipt: unknown,
): Promise<{ result: StoreLinkResult; planCode?: string }> {
  const verification = await verifyStorePurchase(store, receipt);
  if (!verification.ok) {
    return {
      result:
        verification.reason === "NOT_CONFIGURED"
          ? "STORE_NOT_CONNECTED"
          : verification.reason === "UNKNOWN_PRODUCT"
            ? "UNKNOWN_PRODUCT"
            : "VERIFICATION_FAILED",
    };
  }

  const purchase = verification.purchase;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data, error } = await supabaseAdmin.rpc("billing_link_store_purchase", {
    p_provider: store as Provider,
    p_purchase_ref: purchase.purchaseRef,
    p_profile: profileId,
    p_product_id: purchase.productId,
    p_plan_code: purchase.planCode,
    p_environment: purchase.environment,
  });

  if (error) {
    console.error("[store] link failed", { code: error.code });
    return { result: "VERIFICATION_FAILED" };
  }

  const outcome = String(data);
  if (outcome === "owned_by_other") return { result: "OWNED_BY_OTHER_ACCOUNT" };
  return {
    result: outcome === "linked" ? "LINKED" : "ALREADY_OWNED",
    planCode: purchase.planCode,
  };
}

/**
 * Applies one verified store notification.
 *
 * Nothing here decides access: the database routine maps status → entitlement,
 * and refuses stale (out-of-order) events. Entitlements are attached to the
 * account that owns the purchase, never to any account named in the payload —
 * store notifications carry no LYVE user id at all.
 */
export async function applyVerifiedStoreEvent(
  event: VerifiedStoreEvent,
): Promise<StoreEventResult> {
  const product = productFor(event.store, event.productId);
  if (!product) return "UNKNOWN_PRODUCT";

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Atomic idempotency claim — the unique index makes concurrent duplicates safe.
  const { data: claim, error: claimError } = await supabaseAdmin
    .from("billing_events")
    .insert({
      provider: event.store as Provider,
      provider_event_id: event.eventId,
      event_type: event.eventType,
      status: "received",
      signature_verified: true,
      event_created_at: event.eventAt,
      payload_summary: {
        plan_code: product.planCode,
        interval: product.interval,
        environment: event.environment,
        lifecycle: event.lifecycle.reason,
        period_end: event.periodEnd,
      },
    })
    .select("id")
    .single();

  if (claimError) {
    if (claimError.code === "23505") return "DUPLICATE_IGNORED";
    console.error("[store] ledger insert failed", { code: claimError.code });
    throw new Error("LEDGER_UNAVAILABLE");
  }

  const { data, error } = await supabaseAdmin.rpc("billing_apply_store_event", {
    p_provider: event.store as Provider,
    p_purchase_ref: event.purchaseRef,
    p_event_id: event.eventId,
    p_event_at: event.eventAt,
    p_status: event.lifecycle.status as Status,
    p_plan_code: product.planCode,
    p_interval: product.interval as Interval,
    p_currency: null as unknown as string,
    p_period_start: event.periodStart,
    p_period_end: event.periodEnd,
    p_cancel_at_period_end: event.lifecycle.cancelAtPeriodEnd,
    p_entitlements: entitlementsForPlan(product.planCode),
    p_revoke: event.lifecycle.revoke,
    p_reason: event.lifecycle.reason,
  } as never);

  const outcome: StoreEventResult = error
    ? "UNLINKED_PURCHASE"
    : String(data) === "unlinked"
      ? "UNLINKED_PURCHASE"
      : String(data) === "stale"
        ? "STALE_IGNORED"
        : "PROCESSED";

  await supabaseAdmin
    .from("billing_events")
    .update({
      status: error ? "failed" : outcome === "PROCESSED" ? "processed" : "ignored",
      error: error ? "PROCESSING_FAILED" : null,
      processed_at: new Date().toISOString(),
    })
    .eq("id", claim.id);

  if (error) {
    console.error("[store] apply failed", { code: error.code });
    throw new Error("PROCESSING_FAILED");
  }
  return outcome;
}
