/**
 * Shared admin types and the safe projections the admin UI is allowed to see.
 *
 * Data minimisation is a hard rule here: no email, no phone, no auth secrets,
 * no exact coordinates, no private preferences, no storage paths, no message
 * bodies. Staff see identifiers, status, counts and moderation state only.
 */

export const ADMIN_ROLES = ["super_admin", "moderator", "support"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ACCOUNT_STATUSES = ["active", "restricted", "suspended", "banned", "deleted"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const CASE_STATUSES = [
  "open",
  "investigating",
  "action_required",
  "resolved",
  "dismissed",
] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const CASE_PRIORITIES = ["low", "medium", "high", "critical"] as const;
export type CasePriority = (typeof CASE_PRIORITIES)[number];

export const MODERATION_ACTIONS = [
  "review",
  "dismiss",
  "restrict",
  "suspend",
  "ban",
  "restore",
] as const;
export type ModerationAction = (typeof MODERATION_ACTIONS)[number];

export const APPEAL_STATUSES = ["pending", "reviewing", "granted", "denied"] as const;
export type AppealStatus = (typeof APPEAL_STATUSES)[number];

export const APPEAL_BODY_MIN = 10;
export const APPEAL_BODY_MAX = 2000;

export type AdminSession = {
  roles: AdminRole[];
  permissions: string[];
  isStaff: boolean;
};

export type AdminMetrics = {
  totalUsers: number;
  activeUsers: number;
  newUsers7d: number;
  active30d: number;
  pendingReports: number;
  openCases: number;
  suspendedAccounts: number;
  bannedAccounts: number;
  restrictedAccounts: number;
  deletedAccounts: number;
  blockRate: number;
  reportRate: number;
  openAppeals: number;
  highRiskSignals7d: number;
};

export type AdminUserRow = {
  profileId: string;
  firstName: string | null;
  accountStatus: AccountStatus;
  effectiveStatus: AccountStatus;
  suspendedUntil: string | null;
  statusReason: string | null;
  profileComplete: boolean;
  photoCount: number;
  createdAt: string;
  lastActiveAt: string | null;
  deletedAt: string | null;
  reportCount: number;
  blockCount: number;
  openCaseId: string | null;
};

export type AdminCaseRow = {
  caseId: string;
  caseNumber: number;
  subjectId: string;
  subjectName: string | null;
  subjectStatus: AccountStatus;
  source: string;
  category: string | null;
  status: CaseStatus;
  priority: CasePriority;
  reportCount: number;
  signalCount: number;
  createdAt: string;
  updatedAt: string;
};

export type AdminCaseReport = {
  reportId: string;
  kind: "profile" | "message";
  category: string | null;
  /** Free-text supplied by the reporter; never shown to the reported member. */
  description: string | null;
  status: string;
  /** Null unless the viewer holds `reports.reporter.view`. */
  reporterId: string | null;
  createdAt: string;
};

export type AdminCaseSignal = {
  signalId: string;
  riskLevel: string;
  categories: string[];
  screener: string;
  createdAt: string;
};

export type AuditMetadata = Record<string, string | number | boolean | null>;

export type AdminAuditEntry = {
  id: string;
  actorId: string | null;
  actorName: string | null;
  /** Stable machine-readable action code, e.g. USER_SUSPENDED. */
  action: string;
  targetType: string;
  targetId: string | null;
  caseId: string | null;
  reason: string | null;
  metadata: AuditMetadata;
  createdAt: string;
};

export type AdminAppeal = {
  id: string;
  profileId: string;
  firstName: string | null;
  accountStatus: AccountStatus;
  status: AppealStatus;
  body: string;
  decisionNote: string | null;
  createdAt: string;
  decidedAt: string | null;
};

export type MyAccountStanding = {
  status: AccountStatus;
  suspendedUntil: string | null;
  /** Whether the member may file an appeal right now. */
  canAppeal: boolean;
  appeal: { status: AppealStatus; createdAt: string; decisionNote: string | null } | null;
};

export function isRestricted(status: AccountStatus): boolean {
  return status === "restricted" || status === "suspended" || status === "banned";
}
