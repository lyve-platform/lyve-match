/**
 * Admin server functions.
 *
 * Authorisation is NEVER decided here. Every call runs through
 * `requireSupabaseAuth` and then a permission-checked database routine, so a
 * forged client, a direct API call, or a hand-built request all hit the same
 * `has_permission()` gate inside Postgres. These functions only shape input,
 * clamp pagination, and project safe fields.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  ACCOUNT_STATUSES,
  ADMIN_ROLES,
  APPEAL_STATUSES,
  CASE_PRIORITIES,
  CASE_STATUSES,
  MODERATION_ACTIONS,
  type AccountStatus,
  type AdminAppeal,
  type AdminAuditEntry,
  type AuditMetadata,
  type AdminCaseReport,
  type AdminCaseRow,
  type AdminCaseSignal,
  type AdminMetrics,
  type AdminRole,
  type AdminSession,
  type AdminUserRow,
  type AppealStatus,
  type CasePriority,
  type CaseStatus,
  type ModerationAction,
} from "@/lib/admin-core";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireUuid(value: unknown): string {
  const id = String(value ?? "");
  if (!UUID.test(id)) throw new Error("INVALID_ID");
  return id;
}

function clamp(value: unknown, fallback: number, max: number): number {
  const n = Math.trunc(Number(value ?? fallback));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, 0), max);
}

function reason(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, 1000) : null;
}

/** The signed-in user's own roles and permissions. Never trusted for gating. */
export const getAdminSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminSession> => {
    const { data: roleRows } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);

    const roles = (roleRows ?? []).map((row) => row.role as AdminRole);
    if (roles.length === 0) return { roles: [], permissions: [], isStaff: false };

    const { data: permRows } = await context.supabase
      .from("role_permissions")
      .select("permission, role")
      .in("role", roles);

    const permissions = [...new Set((permRows ?? []).map((row) => row.permission))];
    return { roles, permissions, isStaff: true };
  });

export const getAdminMetrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminMetrics> => {
    const { data, error } = await context.supabase.rpc("admin_metrics");
    if (error) throw error;
    const row = (data ?? [])[0] as Record<string, number> | undefined;
    return {
      totalUsers: Number(row?.["total_users"] ?? 0),
      activeUsers: Number(row?.["active_users"] ?? 0),
      newUsers7d: Number(row?.["new_users_7d"] ?? 0),
      active30d: Number(row?.["active_30d"] ?? 0),
      pendingReports: Number(row?.["pending_reports"] ?? 0),
      openCases: Number(row?.["open_cases"] ?? 0),
      suspendedAccounts: Number(row?.["suspended_accounts"] ?? 0),
      bannedAccounts: Number(row?.["banned_accounts"] ?? 0),
      restrictedAccounts: Number(row?.["restricted_accounts"] ?? 0),
      deletedAccounts: Number(row?.["deleted_accounts"] ?? 0),
      blockRate: Number(row?.["block_rate"] ?? 0),
      reportRate: Number(row?.["report_rate"] ?? 0),
      openAppeals: Number(row?.["open_appeals"] ?? 0),
      highRiskSignals7d: Number(row?.["high_risk_signals_7d"] ?? 0),
    };
  });

export const listAdminUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { status?: AccountStatus | null; page?: number }) => ({
    status:
      input?.status && ACCOUNT_STATUSES.includes(input.status) ? (input.status as AccountStatus) : null,
    page: clamp(input?.page, 0, 200),
  }))
  .handler(async ({ data, context }): Promise<AdminUserRow[]> => {
    const { data: rows, error } = await context.supabase.rpc("admin_list_users", {
      ...(data.status ? { p_status: data.status } : {}),
      p_limit: 50,
      p_offset: data.page * 50,
    });
    if (error) throw error;
    return ((rows ?? []) as Array<Record<string, unknown>>).map((row) => ({
      profileId: String(row["profile_id"]),
      firstName: (row["first_name"] as string | null) ?? null,
      accountStatus: row["account_status"] as AccountStatus,
      effectiveStatus: row["effective_status"] as AccountStatus,
      suspendedUntil: (row["suspended_until"] as string | null) ?? null,
      statusReason: (row["status_reason"] as string | null) ?? null,
      profileComplete: Boolean(row["profile_complete"]),
      photoCount: Number(row["photo_count"] ?? 0),
      createdAt: String(row["created_at"]),
      lastActiveAt: (row["last_active_at"] as string | null) ?? null,
      deletedAt: (row["deleted_at"] as string | null) ?? null,
      reportCount: Number(row["report_count"] ?? 0),
      blockCount: Number(row["block_count"] ?? 0),
      openCaseId: (row["open_case_id"] as string | null) ?? null,
    }));
  });

export const listModerationCases = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { status?: CaseStatus | null; page?: number }) => ({
    status: input?.status && CASE_STATUSES.includes(input.status) ? (input.status as CaseStatus) : null,
    page: clamp(input?.page, 0, 200),
  }))
  .handler(async ({ data, context }): Promise<AdminCaseRow[]> => {
    const { data: rows, error } = await context.supabase.rpc("admin_list_cases", {
      ...(data.status ? { p_status: data.status } : {}),
      p_limit: 50,
      p_offset: data.page * 50,
    });
    if (error) throw error;
    return ((rows ?? []) as Array<Record<string, unknown>>).map((row) => ({
      caseId: String(row["case_id"]),
      caseNumber: Number(row["case_number"] ?? 0),
      subjectId: String(row["subject_id"]),
      subjectName: (row["subject_name"] as string | null) ?? null,
      subjectStatus: row["subject_status"] as AccountStatus,
      source: String(row["source"]),
      category: (row["category"] as string | null) ?? null,
      status: row["status"] as CaseStatus,
      priority: row["priority"] as CasePriority,
      reportCount: Number(row["report_count"] ?? 0),
      signalCount: Number(row["signal_count"] ?? 0),
      createdAt: String(row["created_at"]),
      updatedAt: String(row["updated_at"]),
    }));
  });

export const getCaseDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { caseId: string }) => ({ caseId: requireUuid(input?.caseId) }))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ reports: AdminCaseReport[]; signals: AdminCaseSignal[] }> => {
      const [{ data: reportRows, error: reportError }, { data: signalRows }] = await Promise.all([
        context.supabase.rpc("admin_case_reports", { p_case: data.caseId }),
        context.supabase.rpc("admin_case_signals", { p_case: data.caseId }),
      ]);
      if (reportError) throw reportError;

      return {
        reports: ((reportRows ?? []) as Array<Record<string, unknown>>).map((row) => ({
          reportId: String(row["report_id"]),
          kind: row["kind"] === "message" ? "message" : "profile",
          category: (row["category"] as string | null) ?? null,
          description: (row["description"] as string | null) ?? null,
          status: String(row["status"]),
          reporterId: (row["reporter_id"] as string | null) ?? null,
          createdAt: String(row["created_at"]),
        })),
        signals: ((signalRows ?? []) as Array<Record<string, unknown>>).map((row) => ({
          signalId: String(row["signal_id"]),
          riskLevel: String(row["risk_level"]),
          categories: (row["categories"] as string[] | null) ?? [],
          screener: String(row["screener"]),
          createdAt: String(row["created_at"]),
        })),
      };
    },
  );

export const moderateAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      targetId: string;
      action: ModerationAction;
      reason?: string;
      caseId?: string | null;
      days?: number;
    }) => {
      if (!MODERATION_ACTIONS.includes(input?.action)) throw new Error("INVALID_ACTION");
      return {
        targetId: requireUuid(input?.targetId),
        action: input.action,
        reason: reason(input?.reason),
        caseId: input?.caseId ? requireUuid(input.caseId) : null,
        days: input?.days ? clamp(input.days, 7, 365) : null,
      };
    },
  )
  .handler(async ({ data, context }): Promise<{ status: AccountStatus }> => {
    const { data: status, error } = await context.supabase.rpc("admin_moderate_account", {
      p_target: data.targetId,
      p_action: data.action,
      ...(data.reason ? { p_reason: data.reason } : {}),
      ...(data.caseId ? { p_case: data.caseId } : {}),
      ...(data.days ? { p_days: data.days } : {}),
    });
    if (error) throw error;
    return { status: status as AccountStatus };
  });

export const updateModerationCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { caseId: string; status?: CaseStatus; priority?: CasePriority; note?: string }) => ({
      caseId: requireUuid(input?.caseId),
      status: input?.status && CASE_STATUSES.includes(input.status) ? input.status : null,
      priority: input?.priority && CASE_PRIORITIES.includes(input.priority) ? input.priority : null,
      note: reason(input?.note),
    }),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase.rpc("admin_update_case", {
      p_case: data.caseId,
      ...(data.status ? { p_status: data.status } : {}),
      ...(data.priority ? { p_priority: data.priority } : {}),
      ...(data.note ? { p_note: data.note } : {}),
    });
    if (error) throw error;
    return { ok: true };
  });

export const listAuditLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { page?: number }) => ({ page: clamp(input?.page, 0, 200) }))
  .handler(async ({ data, context }): Promise<AdminAuditEntry[]> => {
    const { data: rows, error } = await context.supabase.rpc("admin_list_audit", {
      p_limit: 50,
      p_offset: data.page * 50,
    });
    if (error) throw error;
    return ((rows ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row["id"]),
      actorId: (row["actor_id"] as string | null) ?? null,
      actorName: (row["actor_name"] as string | null) ?? null,
      action: String(row["action"]),
      targetType: String(row["target_type"]),
      targetId: (row["target_id"] as string | null) ?? null,
      caseId: (row["case_id"] as string | null) ?? null,
      reason: (row["reason"] as string | null) ?? null,
      metadata: (row["metadata"] as AuditMetadata) ?? {},
      createdAt: String(row["created_at"]),
    }));
  });

export const listAppeals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { page?: number }) => ({ page: clamp(input?.page, 0, 200) }))
  .handler(async ({ data, context }): Promise<AdminAppeal[]> => {
    const { data: rows, error } = await context.supabase.rpc("admin_list_appeals", {
      p_limit: 50,
      p_offset: data.page * 50,
    });
    if (error) throw error;
    return ((rows ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row["id"]),
      profileId: String(row["profile_id"]),
      firstName: (row["first_name"] as string | null) ?? null,
      accountStatus: row["account_status"] as AccountStatus,
      status: row["status"] as AppealStatus,
      body: String(row["body"] ?? ""),
      decisionNote: (row["decision_note"] as string | null) ?? null,
      createdAt: String(row["created_at"]),
      decidedAt: (row["decided_at"] as string | null) ?? null,
    }));
  });

export const decideAppeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { appealId: string; status: AppealStatus; note?: string }) => {
    if (!APPEAL_STATUSES.includes(input?.status)) throw new Error("INVALID_STATUS");
    return { appealId: requireUuid(input?.appealId), status: input.status, note: reason(input?.note) };
  })
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase.rpc("admin_decide_appeal", {
      p_appeal: data.appealId,
      p_status: data.status,
      ...(data.note ? { p_note: data.note } : {}),
    });
    if (error) throw error;
    return { ok: true };
  });

export const setStaffRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { targetId: string; role: AdminRole; grant: boolean }) => {
    if (!ADMIN_ROLES.includes(input?.role)) throw new Error("INVALID_ROLE");
    return {
      targetId: requireUuid(input?.targetId),
      role: input.role,
      grant: Boolean(input?.grant),
    };
  })
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase.rpc("admin_set_role", {
      p_target: data.targetId,
      p_role: data.role,
      p_grant: data.grant,
    });
    if (error) throw error;
    return { ok: true };
  });

export type StaffRoleRow = {
  userId: string;
  role: AdminRole;
  grantedBy: string | null;
  createdAt: string;
};

export const listStaffRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StaffRoleRow[]> => {
    const { data, error } = await context.supabase.rpc("admin_list_staff");
    if (error) throw error;
    return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      userId: String(row["user_id"]),
      role: row["role"] as AdminRole,
      grantedBy: (row["granted_by"] as string | null) ?? null,
      createdAt: String(row["created_at"]),
    }));
  });
