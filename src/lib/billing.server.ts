/**
 * Server-only billing helpers. Never reachable from the browser bundle.
 *
 * State-changing billing writes are performed with the service role because
 * members are read-only on every billing table by design. Ownership is always
 * established from the authenticated session BEFORE anything privileged runs.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { DEFAULT_CURRENCY, PREMIUM_ENTITLEMENTS, planByCode } from "@/config/billing";
import type {
  MemberEntitlement,
  MemberSubscription,
  SubscriptionStatus,
} from "@/lib/billing-core";

type Client = SupabaseClient<Database>;

/** Reads the member's own subscription through RLS (own rows only). */
export async function loadOwnSubscription(
  supabase: Client,
  userId: string,
): Promise<{ subscription: MemberSubscription | null; providerRef: string | null }> {
  const { data } = await supabase
    .from("subscriptions")
    .select(
      "plan_code, status, billing_interval, currency, purchase_source, current_period_start, current_period_end, cancel_at_period_end, canceled_at, trial_ends_at, provider_subscription_id, created_at",
    )
    .eq("profile_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return { subscription: null, providerRef: null };

  return {
    // provider_subscription_id is deliberately NOT part of the member view.
    subscription: {
      planCode: data.plan_code,
      status: data.status as SubscriptionStatus,
      interval: data.billing_interval,
      currency: data.currency,
      source: data.purchase_source,
      currentPeriodStart: data.current_period_start,
      currentPeriodEnd: data.current_period_end,
      cancelAtPeriodEnd: data.cancel_at_period_end,
      canceledAt: data.canceled_at,
      trialEndsAt: data.trial_ends_at,
    },
    providerRef: data.provider_subscription_id,
  };
}

export async function loadOwnEntitlements(
  supabase: Client,
  _userId: string,
): Promise<MemberEntitlement[]> {
  const { data } = await supabase.rpc("my_entitlements");
  return ((data ?? []) as Array<{ key: string; source: string; expires_at: string | null }>).map(
    (row) => ({
      key: row.key,
      source: row.source as MemberEntitlement["source"],
      expiresAt: row.expires_at,
    }),
  );
}

export async function loadOwnBillingAccount(
  supabase: Client,
  userId: string,
): Promise<{ currency: string; locale: string | null }> {
  const { data } = await supabase
    .from("billing_accounts")
    .select("currency, locale")
    .eq("profile_id", userId)
    .maybeSingle();
  return { currency: data?.currency ?? DEFAULT_CURRENCY, locale: data?.locale ?? null };
}

export function entitlementsForPlan(planCode: string): string[] {
  return planByCode(planCode)?.entitlements ?? PREMIUM_ENTITLEMENTS;
}

/**
 * The single privileged write path into subscription + entitlement state.
 * Callers must have already proven who the subject is (session or verified
 * provider event). The database routine remains the authority on what a
 * status implies for access.
 */
export async function applySubscriptionState(input: {
  profileId: string;
  provider: Database["public"]["Enums"]["billing_provider"];
  providerSubscriptionId: string | null;
  planCode: string;
  status: SubscriptionStatus;
  interval: Database["public"]["Enums"]["billing_interval"];
  currency: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  source: Database["public"]["Enums"]["entitlement_source"];
}): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("billing_apply_subscription", {
    p_profile: input.profileId,
    p_provider: input.provider,
    p_plan_code: input.planCode,
    p_status: input.status,
    p_interval: input.interval,
    p_cancel_at_period_end: input.cancelAtPeriodEnd,
    p_entitlements: entitlementsForPlan(input.planCode),
    p_source: input.source,
    ...(input.providerSubscriptionId
      ? { p_provider_subscription_id: input.providerSubscriptionId }
      : {}),
    ...(input.currency ? { p_currency: input.currency } : {}),
    ...(input.periodStart ? { p_period_start: input.periodStart } : {}),
    ...(input.periodEnd ? { p_period_end: input.periodEnd } : {}),
  });

  if (error) throw error;
  return String(data);
}

export async function revokeSubscriptionEntitlements(
  provider: Database["public"]["Enums"]["billing_provider"],
  providerSubscriptionId: string,
  reason: string,
): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("billing_revoke_subscription_entitlements", {
    p_provider: provider,
    p_provider_subscription_id: providerSubscriptionId,
    p_reason: reason,
  });
  if (error) throw error;
  return Number(data ?? 0);
}
