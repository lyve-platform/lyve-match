/**
 * Mobile store billing server functions.
 *
 * The subject of every call is `context.userId` from the verified session.
 * No handler accepts a profile id, plan, status or entitlement from the
 * client: the app may only present a store receipt, and the server decides
 * whether it is authentic and who it belongs to.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { MemberStorePurchase, StoreLinkResult } from "@/lib/billing/store-core";
import { isStoreId } from "@/lib/billing/store-core";

/** Binds a verified purchase to the signed-in account. Never grants directly. */
export const linkStorePurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { store: string; receipt: string }) => ({
    store: String(input?.store ?? ""),
    receipt: String(input?.receipt ?? ""),
  }))
  .handler(async ({ data, context }): Promise<{ result: StoreLinkResult }> => {
    if (!isStoreId(data.store)) return { result: "VERIFICATION_FAILED" };

    // Linking is the only member-reachable path into store verification, so it
    // is throttled per account: receipt guessing is not a viable strategy.
    const { consumeRate, raiseStoreAlert, RATE_LIMITS } = await import("@/lib/billing/store-ops.server");
    const rate = await consumeRate(`link:${context.userId}`, RATE_LIMITS.link);
    if (!rate.allowed) {
      await raiseStoreAlert("store_rate_limited", `link:${context.userId}`, {
        store: data.store,
        hits: rate.hits,
        reason: "link_throttled",
      });
      return { result: "RATE_LIMITED" };
    }

    const { linkVerifiedPurchase } = await import("@/lib/billing/store.server");
    const outcome = await linkVerifiedPurchase(context.userId, data.store, data.receipt);
    if (outcome.result === "VERIFICATION_FAILED" || outcome.result === "OWNED_BY_OTHER_ACCOUNT") {
      await raiseStoreAlert("store_link_rejected", `link:${context.userId}`, {
        store: data.store,
        result: outcome.result,
      });
    }
    return { result: outcome.result };
  });

/**
 * Restore purchases: a READ of what the server already knows about this
 * account. It cannot create, transfer or upgrade access.
 */
export const listOwnStorePurchases = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MemberStorePurchase[]> => {
    const { data } = await context.supabase
      .from("store_purchases")
      .select("provider, plan_code, status, environment, linked_at")
      .order("linked_at", { ascending: false });

    return (data ?? []).map((row) => ({
      store: row.provider as MemberStorePurchase["store"],
      planCode: row.plan_code,
      status: row.status as MemberStorePurchase["status"],
      environment: row.environment as MemberStorePurchase["environment"],
      linkedAt: row.linked_at,
    }));
  });
