/**
 * Security monitoring server functions.
 *
 * Access is decided by permission-checked database routines
 * (`security.view` / `security.ack`); these wrappers only shape the payload.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  AlertMetadata,
  AlertSeverity,
  FunctionPrivilege,
  SecurityAlert,
} from "@/lib/security-monitoring-core";

export const listSecurityAlerts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { severity?: AlertSeverity | null; unacknowledgedOnly?: boolean }) => ({
    severity: input?.severity ?? null,
    unacknowledgedOnly: Boolean(input?.unacknowledgedOnly),
  }))
  .handler(async ({ data, context }): Promise<SecurityAlert[]> => {
    const { data: rows, error } = await context.supabase.rpc("admin_list_security_alerts", {
      ...(data.severity ? { p_severity: data.severity } : {}),
      p_unacknowledged_only: data.unacknowledgedOnly,
      p_limit: 100,
      p_offset: 0,
    });
    if (error) throw error;
    return ((rows ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row["id"]),
      kind: String(row["kind"]),
      severity: row["severity"] as AlertSeverity,
      actorId: (row["actor_id"] as string | null) ?? null,
      actorName: (row["actor_name"] as string | null) ?? null,
      targetId: (row["target_id"] as string | null) ?? null,
      summary: String(row["summary"]),
      metadata: (row["metadata"] as AlertMetadata) ?? {},
      createdAt: String(row["created_at"]),
      acknowledgedAt: (row["acknowledged_at"] as string | null) ?? null,
      acknowledgedBy: (row["acknowledged_by"] as string | null) ?? null,
    }));
  });

export const acknowledgeSecurityAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { alertId: string }) => ({ alertId: String(input?.alertId ?? "") }))
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const { data: ok, error } = await context.supabase.rpc("admin_acknowledge_security_alert", {
      p_alert: data.alertId,
    });
    if (error) throw error;
    return { ok: Boolean(ok) };
  });

export const getFunctionPrivilegeReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FunctionPrivilege[]> => {
    const { data: rows, error } = await context.supabase.rpc("admin_function_privilege_report");
    if (error) throw error;
    return ((rows ?? []) as Array<Record<string, unknown>>).map((row) => ({
      functionName: String(row["function_name"]),
      arguments: String(row["arguments"] ?? ""),
      securityType: row["security_type"] === "definer" ? "definer" : "invoker",
      anonExecute: Boolean(row["anon_execute"]),
      authenticatedExecute: Boolean(row["authenticated_execute"]),
      serviceRoleExecute: Boolean(row["service_role_execute"]),
    }));
  });
