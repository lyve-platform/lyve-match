/**
 * Admin billing server functions.
 *
 * Authorisation is entirely in the database: `admin_billing_overview`,
 * `admin_grant_entitlement` and `admin_revoke_entitlement` each require the
 * corresponding permission (`billing.view`, `billing.view.limited`,
 * `billing.grant`) and derive the actor from the session — the client cannot
 * spoof the actor, widen the projection, or reach a grant it lacks.
 *
 * Grants are bounded: a reason is mandatory and the duration must be 1–365
 * days, so an unlimited grant is not expressible. Expiry is set by the routine
 * and is not editable afterwards; a change means a new audited action.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isEntitlementKey } from "@/config/billing";
import {
  ADMIN_GRANT_MAX_DAYS,
  ADMIN_GRANT_MIN_DAYS,
  ADMIN_GRANT_REASON_MIN,
  type AdminBillingRow,
  type AdminEntitlementRow,
} from "@/lib/billing-core";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuid(value: unknown, code: string): string {
  const id = String(value ?? "");
  if (!UUID.test(id)) throw new Error(code);
  return id;
}

export const adminBillingOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { profileId?: string | null } | undefined) => ({
    profileId: input?.profileId ? uuid(input.profileId, "INVALID_PROFILE") : null,
  }))
  .handler(async ({ data, context }): Promise<AdminBillingRow[]> => {
    const { data: rows, error } = await context.supabase.rpc("admin_billing_overview", {
      p_profile: data.profileId,
    } as never);
    if (error) throw new Error("FORBIDDEN");

    type Row = {
      profile_id: string;
      plan_code: string;
      provider: AdminBillingRow["provider"];
      purchase_source: AdminBillingRow["purchaseSource"];
      status: AdminBillingRow["status"];
      billing_interval: AdminBillingRow["interval"];
      currency: string | null;
      current_period_start: string | null;
      current_period_end: string | null;
      cancel_at_period_end: boolean;
      canceled_at: string | null;
      trial_ends_at: string | null;
      provider_subscription_id: string | null;
      entitlement_keys: string[] | null;
      created_at: string;
    };

    return ((rows ?? []) as unknown as Row[]).map((row) => ({
      profileId: row.profile_id,
      planCode: row.plan_code,
      provider: row.provider,
      purchaseSource: row.purchase_source,
      status: row.status,
      interval: row.billing_interval,
      currency: row.currency,
      currentPeriodStart: row.current_period_start,
      currentPeriodEnd: row.current_period_end,
      cancelAtPeriodEnd: row.cancel_at_period_end,
      canceledAt: row.canceled_at,
      trialEndsAt: row.trial_ends_at,
      // Already NULL-projected by the database for limited billing roles.
      providerSubscriptionId: row.provider_subscription_id,
      entitlementKeys: row.entitlement_keys ?? [],
      createdAt: row.created_at,
    }));
  });

export const adminListEntitlements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { profileId: string }) => ({
    profileId: uuid(input?.profileId, "INVALID_PROFILE"),
  }))
  .handler(async ({ data, context }): Promise<AdminEntitlementRow[]> => {
    const { data: rows, error } = await context.supabase.rpc("admin_list_entitlements", {
      p_profile: data.profileId,
    });
    if (error) throw new Error("FORBIDDEN");

    type Row = {
      id: string;
      key: string;
      source: AdminEntitlementRow["source"];
      starts_at: string;
      expires_at: string | null;
      revoked_at: string | null;
      reason: string | null;
      revoke_reason: string | null;
      created_at: string;
    };

    return ((rows ?? []) as unknown as Row[]).map((row) => ({
      id: row.id,
      key: row.key,
      source: row.source,
      startsAt: row.starts_at,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
      reason: row.reason,
      revokeReason: row.revoke_reason,
      createdAt: row.created_at,
    }));
  });

export const adminGrantEntitlement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { profileId: string; key: string; days: number; reason: string }) => {
    const reason = String(input?.reason ?? "").trim();
    if (reason.length < ADMIN_GRANT_REASON_MIN) throw new Error("REASON_REQUIRED");

    const days = Math.trunc(Number(input?.days));
    if (!Number.isFinite(days) || days < ADMIN_GRANT_MIN_DAYS || days > ADMIN_GRANT_MAX_DAYS) {
      throw new Error("DURATION_INVALID");
    }
    if (!isEntitlementKey(input?.key)) throw new Error("INVALID_KEY");

    return {
      profileId: uuid(input?.profileId, "INVALID_PROFILE"),
      key: input.key,
      days,
      reason: reason.slice(0, 500),
    };
  })
  .handler(async ({ data, context }): Promise<{ code: "OK"; id: string }> => {
    // Actor comes from the session inside the routine; nothing here can spoof it.
    const { data: id, error } = await context.supabase.rpc("admin_grant_entitlement", {
      p_target: data.profileId,
      p_key: data.key,
      p_days: data.days,
      p_reason: data.reason,
    });
    if (error) throw new Error("FORBIDDEN");
    return { code: "OK", id: String(id) };
  });

export const adminRevokeEntitlement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { entitlementId: string; reason: string }) => {
    const reason = String(input?.reason ?? "").trim();
    if (reason.length < ADMIN_GRANT_REASON_MIN) throw new Error("REASON_REQUIRED");
    return {
      entitlementId: uuid(input?.entitlementId, "INVALID_ENTITLEMENT"),
      reason: reason.slice(0, 500),
    };
  })
  .handler(async ({ data, context }): Promise<{ code: "OK" }> => {
    const { error } = await context.supabase.rpc("admin_revoke_entitlement", {
      p_entitlement: data.entitlementId,
      p_reason: data.reason,
    });
    if (error) throw new Error("FORBIDDEN");
    return { code: "OK" };
  });
