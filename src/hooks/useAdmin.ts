import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  decideAppeal,
  getAdminMetrics,
  getAdminSession,
  getCaseDetail,
  listAdminUsers,
  listAppeals,
  listAuditLog,
  listModerationCases,
  listStaffRoles,
  setStaffRole,
  moderateAccount,
  updateModerationCase,
} from "@/lib/admin.functions";
import { getMyStanding, submitAppeal } from "@/lib/appeals.functions";
import type {
  AccountStatus,
  AdminRole,
  AppealStatus,
  CasePriority,
  CaseStatus,
  ModerationAction,
} from "@/lib/admin-core";

export const adminKeys = {
  session: ["admin", "session"] as const,
  metrics: ["admin", "metrics"] as const,
  users: ["admin", "users"] as const,
  cases: ["admin", "cases"] as const,
  caseDetail: ["admin", "case"] as const,
  audit: ["admin", "audit"] as const,
  appeals: ["admin", "appeals"] as const,
  standing: ["account", "standing"] as const,
};

/** The viewer's own roles. Display only — the database gates every call. */
export function useAdminSession() {
  const fetchSession = useServerFn(getAdminSession);
  return useQuery({
    queryKey: adminKeys.session,
    queryFn: () => fetchSession(),
    staleTime: 60_000,
    retry: false,
  });
}

export function useAdminMetrics(enabled: boolean) {
  const fetchMetrics = useServerFn(getAdminMetrics);
  return useQuery({ queryKey: adminKeys.metrics, queryFn: () => fetchMetrics(), enabled, retry: false });
}

export function useAdminUsers(enabled: boolean, status: AccountStatus | null) {
  const fetchUsers = useServerFn(listAdminUsers);
  return useQuery({
    queryKey: [...adminKeys.users, status],
    queryFn: () => fetchUsers({ data: { status, page: 0 } }),
    enabled,
    retry: false,
  });
}

export function useAdminCases(enabled: boolean, status: CaseStatus | null) {
  const fetchCases = useServerFn(listModerationCases);
  return useQuery({
    queryKey: [...adminKeys.cases, status],
    queryFn: () => fetchCases({ data: { status, page: 0 } }),
    enabled,
    retry: false,
  });
}

export function useCaseDetail(caseId: string | null) {
  const fetchDetail = useServerFn(getCaseDetail);
  return useQuery({
    queryKey: [...adminKeys.caseDetail, caseId],
    queryFn: () => fetchDetail({ data: { caseId: caseId as string } }),
    enabled: Boolean(caseId),
    retry: false,
  });
}

export function useAuditLog(enabled: boolean) {
  const fetchAudit = useServerFn(listAuditLog);
  return useQuery({
    queryKey: adminKeys.audit,
    queryFn: () => fetchAudit({ data: { page: 0 } }),
    enabled,
    retry: false,
  });
}

export function useAppeals(enabled: boolean) {
  const fetchAppeals = useServerFn(listAppeals);
  return useQuery({
    queryKey: adminKeys.appeals,
    queryFn: () => fetchAppeals({ data: { page: 0 } }),
    enabled,
    retry: false,
  });
}

export function useModerationActions() {
  const queryClient = useQueryClient();
  const act = useServerFn(moderateAccount);
  const update = useServerFn(updateModerationCase);
  const decide = useServerFn(decideAppeal);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin"] });
  };

  return {
    moderate: useMutation({
      mutationFn: (input: {
        targetId: string;
        action: ModerationAction;
        reason?: string;
        caseId?: string | null;
        days?: number;
      }) => act({ data: input }),
      onSuccess: invalidate,
    }),
    updateCase: useMutation({
      mutationFn: (input: {
        caseId: string;
        status?: CaseStatus;
        priority?: CasePriority;
        note?: string;
      }) => update({ data: input }),
      onSuccess: invalidate,
    }),
    decideAppeal: useMutation({
      mutationFn: (input: { appealId: string; status: AppealStatus; note?: string }) =>
        decide({ data: input }),
      onSuccess: invalidate,
    }),
  };
}

/** The signed-in member's own account standing, used for banners and appeals. */
export function useMyStanding() {
  const fetchStanding = useServerFn(getMyStanding);
  return useQuery({
    queryKey: adminKeys.standing,
    queryFn: () => fetchStanding(),
    staleTime: 60_000,
    retry: false,
  });
}

export function useSubmitAppeal() {
  const queryClient = useQueryClient();
  const submit = useServerFn(submitAppeal);
  return useMutation({
    mutationFn: (body: string) => submit({ data: { body } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.standing });
    },
  });
}

/** Staff role directory. Gated in the database by the `roles.manage` permission. */
export function useStaffRoles(enabled: boolean) {
  const fetchStaff = useServerFn(listStaffRoles);
  return useQuery({
    queryKey: ["admin", "staff"],
    queryFn: () => fetchStaff(),
    enabled,
    retry: false,
  });
}

export function useSetStaffRole() {
  const queryClient = useQueryClient();
  const set = useServerFn(setStaffRole);
  return useMutation({
    mutationFn: (input: { targetId: string; role: AdminRole; grant: boolean }) =>
      set({ data: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
  });
}
