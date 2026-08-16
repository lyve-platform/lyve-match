/**
 * Payments activation flag.
 *
 * Postgres is the single source of truth and decides authorisation
 * (`require_permission('settings.billing')`), so a forged request body or a
 * tampered client cannot flip payments on.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PaymentsSetting = {
  paymentsEnabled: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
  updatedByName: string | null;
};

export const getPaymentsSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PaymentsSetting> => {
    const { data, error } = await context.supabase.rpc("admin_billing_setting");
    if (error) throw error;
    const row = (data ?? [])[0] as Record<string, unknown> | undefined;
    return {
      paymentsEnabled: row?.["payments_enabled"] === true,
      updatedAt: (row?.["updated_at"] as string | null) ?? null,
      updatedBy: (row?.["updated_by"] as string | null) ?? null,
      updatedByName: (row?.["updated_by_name"] as string | null) ?? null,
    };
  });

export const setPaymentsEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { enabled: boolean }) => ({ enabled: data?.enabled === true }))
  .handler(async ({ context, data }): Promise<{ paymentsEnabled: boolean }> => {
    const { data: result, error } = await context.supabase.rpc("admin_set_payments_enabled", {
      p_enabled: data.enabled,
    });
    if (error) throw error;
    return { paymentsEnabled: result === true };
  });
