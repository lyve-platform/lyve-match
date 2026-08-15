/**
 * Localization feature-flag server functions.
 *
 * The database is the single source of truth. Authorisation is decided inside
 * Postgres (`require_permission`), so a forged request body, a direct API call
 * or tampered client state all hit the same gate.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type LocalizationSetting = {
  arabicEnabled: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
  updatedByName: string | null;
};

export const getLocalizationSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LocalizationSetting> => {
    const { data, error } = await context.supabase.rpc("admin_localization_setting");
    if (error) throw error;
    const row = (data ?? [])[0] as Record<string, unknown> | undefined;
    return {
      arabicEnabled: row?.["arabic_enabled"] === true,
      updatedAt: (row?.["updated_at"] as string | null) ?? null,
      updatedBy: (row?.["updated_by"] as string | null) ?? null,
      updatedByName: (row?.["updated_by_name"] as string | null) ?? null,
    };
  });

export const setArabicEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { enabled: boolean }) => ({ enabled: data?.enabled === true }))
  .handler(async ({ context, data }): Promise<{ arabicEnabled: boolean }> => {
    const { data: result, error } = await context.supabase.rpc("admin_set_arabic_enabled", {
      p_enabled: data.enabled,
    });
    if (error) throw error;
    return { arabicEnabled: result === true };
  });
