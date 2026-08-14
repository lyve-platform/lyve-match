/**
 * Billing server functions.
 *
 * Ownership rule: the subject of every operation is `context.userId`, taken
 * from the verified session. No handler accepts a profile id, a subscription
 * id, a status, an entitlement or an expiry from the client — those are read
 * from, or written by, the database only.
 *
 * The browser may REQUEST a checkout. It can never grant Premium: no code path
 * here writes an entitlement in response to a client claim.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  BILLING_PLANS,
  BILLING_STAGE,
  DEFAULT_CURRENCY,
  isCheckoutOffered,
  isLiveCheckout,
  planByCode,
  type BillingIntervalId,
} from "@/config/billing";
import type {
  BillingActionResult,
  BillingSnapshot,
  CheckoutOutcome,
} from "@/lib/billing-core";
import { requireEntitlement } from "@/lib/entitlements.server";
import {
  applySubscriptionState,
  loadOwnBillingAccount,
  loadOwnEntitlements,
  loadOwnSubscription,
} from "@/lib/billing.server";
import { configuredProviderId, resolveProvider } from "@/lib/billing/resolver";

const CURRENCY = /^[A-Z]{3}$/;

function planCode(value: unknown): string {
  const code = String(value ?? "");
  if (!planByCode(code)) throw new Error("INVALID_PLAN");
  return code;
}

function currency(value: unknown): string {
  const code = String(value ?? DEFAULT_CURRENCY).toUpperCase();
  return CURRENCY.test(code) ? code : DEFAULT_CURRENCY;
}

/** Everything the Premium page and settings need, in one authorised read. */
export const getBillingSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BillingSnapshot> => {
    const providerId = configuredProviderId();
    const provider = resolveProvider(providerId);

    const [{ subscription }, entitlements, account] = await Promise.all([
      loadOwnSubscription(context.supabase, context.userId),
      loadOwnEntitlements(context.supabase, context.userId),
      loadOwnBillingAccount(context.supabase, context.userId),
    ]);

    return {
      provider: providerId,
      stage: BILLING_STAGE,
      checkoutOffered: isCheckoutOffered(providerId) && provider.supportsCheckout,
      checkoutIsLive: isLiveCheckout(providerId) && provider.isLive,
      portalSupported: provider.supportsPortal,
      currency: account.currency,
      locale: account.locale,
      subscription,
      entitlements,
      isPremium: entitlements.some((entitlement) => entitlement.key === "premium"),
    };
  });

/**
 * Requests a checkout session from the configured provider.
 *
 * With `none` this always returns CHECKOUT_NOT_CONNECTED. With `mock` it
 * returns a TEST artefact and — because the mock provider has no real payment
 * rail — no subscription is created here: state only ever changes through a
 * signed webhook, exactly as it will with a real provider.
 */
export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { planCode: string; currency?: string }) => ({
    planCode: planCode(input?.planCode),
    currency: currency(input?.currency),
  }))
  .handler(async ({ data, context }): Promise<CheckoutOutcome> => {
    const provider = resolveProvider();
    const plan = planByCode(data.planCode)!;

    if (!provider.supportsCheckout) {
      return { mode: "none", code: "CHECKOUT_NOT_CONNECTED", url: null, sessionId: null };
    }

    try {
      return await provider.createCheckout({
        profileId: context.userId,
        planCode: plan.code,
        interval: plan.interval as BillingIntervalId,
        currency: data.currency,
      });
    } catch {
      // Provider errors can carry credentials or internal detail: never surface them.
      return { mode: provider.isLive ? "live" : "test", code: "CHECKOUT_UNAVAILABLE", url: null, sessionId: null };
    }
  });

/**
 * Cancels at period end. The member keeps Premium until `current_period_end`,
 * which is exactly what the database routine encodes.
 */
export const cancelSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BillingActionResult> => {
    const provider = resolveProvider();
    const { subscription, providerRef } = await loadOwnSubscription(context.supabase, context.userId);
    if (!subscription) return { code: "NO_SUBSCRIPTION" };
    if (!provider.supportsSelfServiceLifecycle) return { code: "NOT_SUPPORTED" };

    await applySubscriptionState({
      profileId: context.userId,
      provider: provider.id as "mock",
      providerSubscriptionId: providerRef,
      planCode: subscription.planCode,
      status: "canceled",
      interval: subscription.interval,
      currency: subscription.currency,
      periodStart: subscription.currentPeriodStart,
      periodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: true,
      source: subscription.source,
    });
    return { code: "OK" };
  });

/** Resumes a cancellation that has not yet lapsed. Never extends the period. */
export const resumeSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BillingActionResult> => {
    const provider = resolveProvider();
    const { subscription, providerRef } = await loadOwnSubscription(context.supabase, context.userId);
    if (!subscription) return { code: "NO_SUBSCRIPTION" };
    if (!provider.supportsSelfServiceLifecycle) return { code: "NOT_SUPPORTED" };

    const periodLive =
      subscription.currentPeriodEnd !== null &&
      new Date(subscription.currentPeriodEnd).getTime() > Date.now();
    if (!periodLive) return { code: "NO_SUBSCRIPTION" };

    await applySubscriptionState({
      profileId: context.userId,
      provider: provider.id as "mock",
      providerSubscriptionId: providerRef,
      planCode: subscription.planCode,
      status: "active",
      interval: subscription.interval,
      currency: subscription.currency,
      periodStart: subscription.currentPeriodStart,
      periodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: false,
      source: subscription.source,
    });
    return { code: "OK" };
  });

/** Opens a provider self-service portal when the adapter supports one. */
export const manageSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BillingActionResult> => {
    const provider = resolveProvider();
    if (!provider.supportsPortal) return { code: "NOT_SUPPORTED" };

    const { providerRef } = await loadOwnSubscription(context.supabase, context.userId);
    try {
      const portal = await provider.createPortalSession({
        profileId: context.userId,
        providerSubscriptionId: providerRef,
      });
      return portal.supported ? { code: "OK", url: portal.url } : { code: "NOT_SUPPORTED" };
    } catch {
      return { code: "PROVIDER_UNAVAILABLE" };
    }
  });

/**
 * Restore: re-reads authoritative state from the database. It deliberately
 * cannot create or upgrade access — a restore is a read, not a grant.
 */
export const restoreSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BillingSnapshot> => {
    const providerId = configuredProviderId();
    const provider = resolveProvider(providerId);
    const [{ subscription }, entitlements, account] = await Promise.all([
      loadOwnSubscription(context.supabase, context.userId),
      loadOwnEntitlements(context.supabase, context.userId),
      loadOwnBillingAccount(context.supabase, context.userId),
    ]);
    return {
      provider: providerId,
      stage: BILLING_STAGE,
      checkoutOffered: isCheckoutOffered(providerId) && provider.supportsCheckout,
      checkoutIsLive: isLiveCheckout(providerId) && provider.isLive,
      portalSupported: provider.supportsPortal,
      currency: account.currency,
      locale: account.locale,
      subscription,
      entitlements,
      isPremium: entitlements.some((entitlement) => entitlement.key === "premium"),
    };
  });

/** Plan catalogue for the pricing UI. Prices stay `null` until announced. */
export const getBillingPlans = createServerFn({ method: "GET" }).handler(async () =>
  BILLING_PLANS.map((plan) => ({
    code: plan.code,
    interval: plan.interval,
    prices: plan.prices,
  })),
);

/**
 * Rewind — Premium service boundary.
 *
 * Entitlement is checked server-side; the pass must belong to the caller and
 * be recent, and only one (the most recent) can ever be undone per call, so a
 * replayed request cannot walk backwards through someone's history.
 */
export const rewindLastPass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({ context }): Promise<{ code: "OK" | "NOTHING_TO_REWIND"; profileId?: string }> => {
      await requireEntitlement(context.supabase, context.userId, "rewind");

      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: pass } = await context.supabase
        .from("passes")
        .select("id, passed_id, created_at")
        .eq("passer_id", context.userId) // ownership: only the caller's own action
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!pass) return { code: "NOTHING_TO_REWIND" };

      const { error } = await context.supabase
        .from("passes")
        .delete()
        .eq("id", pass.id)
        .eq("passer_id", context.userId);
      if (error) throw new Error("REWIND_FAILED");

      return { code: "OK", profileId: pass.passed_id };
    },
  );
