/**
 * Admin panel building blocks.
 *
 * Nothing here decides access: every list and every action is served by a
 * permission-checked database routine. Permissions are used only to avoid
 * showing a control that would be refused anyway.
 */
import { useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@/i18n";
import {
  useAdminCases,
  useAdminMetrics,
  useAdminUsers,
  useAppeals,
  useAuditLog,
  useCaseDetail,
  useModerationActions,
} from "@/hooks/useAdmin";
import type {
  AccountStatus,
  AdminCaseRow,
  AppealStatus,
  CaseStatus,
  ModerationAction,
} from "@/lib/admin-core";
import { ACCOUNT_STATUSES, MODERATION_ACTIONS } from "@/lib/admin-core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

function useDate() {
  const { locale } = useI18n();
  return (value: string | null | undefined) =>
    value ? new Date(value).toLocaleDateString(locale === "ar" ? "ar" : "en", { dateStyle: "medium" }) : "—";
}

function shortId(value: string | null) {
  return value ? value.slice(0, 8) : "—";
}

export function StatusBadge({ status }: { status: AccountStatus }) {
  const { t } = useI18n();
  return (
    <Badge variant={status === "active" ? "secondary" : "outline"}>{t.admin.status[status]}</Badge>
  );
}

function Empty({ label }: { label: string }) {
  return <p className="py-6 text-sm text-muted-foreground">{label}</p>;
}

function Pending({ label }: { label: string }) {
  return <p className="py-6 text-sm text-muted-foreground">{label}</p>;
}

/* ------------------------------------------------------------------ overview */
export function OverviewPanel({ enabled }: { enabled: boolean }) {
  const { t } = useI18n();
  const query = useAdminMetrics(enabled);

  if (query.isPending) return <Pending label={t.admin.loading} />;
  if (query.error || !query.data) return <Empty label={t.admin.error} />;

  const m = query.data;
  const items: Array<[string, string | number]> = [
    [t.admin.metrics.totalUsers, m.totalUsers],
    [t.admin.metrics.activeUsers, m.activeUsers],
    [t.admin.metrics.newUsers7d, m.newUsers7d],
    [t.admin.metrics.active30d, m.active30d],
    [t.admin.metrics.pendingReports, m.pendingReports],
    [t.admin.metrics.openCases, m.openCases],
    [t.admin.metrics.restrictedAccounts, m.restrictedAccounts],
    [t.admin.metrics.suspendedAccounts, m.suspendedAccounts],
    [t.admin.metrics.bannedAccounts, m.bannedAccounts],
    [t.admin.metrics.deletedAccounts, m.deletedAccounts],
    [t.admin.metrics.blockRate, `${(m.blockRate * 100).toFixed(1)}%`],
    [t.admin.metrics.reportRate, `${(m.reportRate * 100).toFixed(1)}%`],
    [t.admin.metrics.openAppeals, m.openAppeals],
    [t.admin.metrics.highRiskSignals7d, m.highRiskSignals7d],
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(([label, value]) => (
        <Card key={label}>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------------- users */
export function UsersPanel({ enabled }: { enabled: boolean }) {
  const { t } = useI18n();
  const formatDate = useDate();
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const query = useAdminUsers(enabled, status);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={status === null ? "default" : "outline"}
          className="rounded-full"
          onClick={() => setStatus(null)}
        >
          {t.admin.users.filterAll}
        </Button>
        {ACCOUNT_STATUSES.map((item) => (
          <Button
            key={item}
            size="sm"
            variant={status === item ? "default" : "outline"}
            className="rounded-full"
            onClick={() => setStatus(item)}
          >
            {t.admin.status[item]}
          </Button>
        ))}
      </div>

      {query.isPending ? <Pending label={t.admin.loading} /> : null}
      {query.error ? <Empty label={t.admin.error} /> : null}
      {query.data?.length === 0 ? <Empty label={t.admin.users.empty} /> : null}

      <ul className="space-y-3">
        {(query.data ?? []).map((user) => (
          <li key={user.profileId}>
            <Card>
              <CardContent className="space-y-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{user.firstName ?? "—"}</span>
                  <code className="text-xs text-muted-foreground">{shortId(user.profileId)}</code>
                  <StatusBadge status={user.effectiveStatus} />
                  {user.openCaseId ? <Badge variant="outline">{t.admin.users.openCase}</Badge> : null}
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-3">
                  <div>
                    <dt className="inline">{t.admin.users.created}: </dt>
                    <dd className="inline">{formatDate(user.createdAt)}</dd>
                  </div>
                  <div>
                    <dt className="inline">{t.admin.users.lastActive}: </dt>
                    <dd className="inline">{formatDate(user.lastActiveAt) || t.admin.users.never}</dd>
                  </div>
                  <div>
                    <dt className="inline">{t.admin.users.reports}: </dt>
                    <dd className="inline tabular-nums">{user.reportCount}</dd>
                  </div>
                  <div>
                    <dt className="inline">{t.admin.users.blocks}: </dt>
                    <dd className="inline tabular-nums">{user.blockCount}</dd>
                  </div>
                  <div>
                    <dt className="inline">{t.admin.users.photos}: </dt>
                    <dd className="inline tabular-nums">{user.photoCount}</dd>
                  </div>
                  <div>
                    {user.profileComplete ? t.admin.users.complete : t.admin.users.incomplete}
                  </div>
                </dl>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* --------------------------------------------------------------------- cases */
function CaseDetail({
  caseRow,
  permissions,
}: {
  caseRow: AdminCaseRow;
  permissions: string[];
}) {
  const { t } = useI18n();
  const formatDate = useDate();
  const detail = useCaseDetail(caseRow.caseId);
  const { moderate } = useModerationActions();
  const [note, setNote] = useState("");
  const [days, setDays] = useState(7);

  const permissionFor: Record<ModerationAction, string> = {
    review: "action.review",
    dismiss: "action.dismiss",
    restrict: "action.restrict",
    suspend: "action.suspend",
    ban: "action.ban",
    restore: "action.restore",
  };

  async function run(action: ModerationAction) {
    try {
      await moderate.mutateAsync({
        targetId: caseRow.subjectId,
        action,
        reason: note,
        caseId: caseRow.caseId,
        ...(action === "suspend" ? { days } : {}),
      });
      toast.success(t.admin.cases.actionDone);
      setNote("");
    } catch {
      toast.error(t.admin.error);
    }
  }

  return (
    <div className="mt-4 space-y-4 border-t border-border pt-4">
      <div>
        <h4 className="text-sm font-medium">{t.admin.cases.reports}</h4>
        {detail.data?.reports.length ? (
          <ul className="mt-2 space-y-2">
            {detail.data.reports.map((report) => (
              <li key={report.reportId} className="rounded-lg bg-muted/50 p-3 text-xs">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{report.kind}</Badge>
                  <span>{report.category ? t.discover.reportCategories[
                    report.category as keyof typeof t.discover.reportCategories
                  ] : "—"}</span>
                  <span className="text-muted-foreground">{formatDate(report.createdAt)}</span>
                </div>
                {report.description ? <p className="mt-2">{report.description}</p> : null}
                <p className="mt-2 text-muted-foreground">
                  {t.admin.cases.reporter}:{" "}
                  {report.reporterId ? shortId(report.reporterId) : t.admin.cases.reporterHidden}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <Empty label={t.admin.cases.noReports} />
        )}
      </div>

      <div>
        <h4 className="text-sm font-medium">{t.admin.cases.signals}</h4>
        {detail.data?.signals.length ? (
          <ul className="mt-2 space-y-2">
            {detail.data.signals.map((signal) => (
              <li key={signal.signalId} className="rounded-lg bg-muted/50 p-3 text-xs">
                <Badge variant="outline">{signal.riskLevel}</Badge>{" "}
                <span>{signal.categories.join(", ")}</span>{" "}
                <span className="text-muted-foreground">{formatDate(signal.createdAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty label={t.admin.cases.noSignals} />
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor={`note-${caseRow.caseId}`}>{t.admin.cases.note}</Label>
        <Textarea
          id={`note-${caseRow.caseId}`}
          value={note}
          rows={2}
          maxLength={1000}
          placeholder={t.admin.cases.notePlaceholder}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>

      {permissions.includes("action.suspend") ? (
        <div className="max-w-40 space-y-2">
          <Label htmlFor={`days-${caseRow.caseId}`}>{t.admin.cases.days}</Label>
          <Input
            id={`days-${caseRow.caseId}`}
            type="number"
            min={1}
            max={365}
            value={days}
            onChange={(event) => setDays(Number(event.target.value) || 7)}
          />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {MODERATION_ACTIONS.filter((action) => permissions.includes(permissionFor[action])).map(
          (action) => (
            <Button
              key={action}
              size="sm"
              variant={action === "ban" ? "destructive" : "outline"}
              className="rounded-full"
              disabled={moderate.isPending}
              onClick={() => void run(action)}
            >
              {t.admin.actions[action]}
            </Button>
          ),
        )}
      </div>
    </div>
  );
}

export function CasesPanel({ enabled, permissions }: { enabled: boolean; permissions: string[] }) {
  const { t } = useI18n();
  const formatDate = useDate();
  const [status] = useState<CaseStatus | null>(null);
  const [openCase, setOpenCase] = useState<string | null>(null);
  const query = useAdminCases(enabled, status);

  if (query.isPending) return <Pending label={t.admin.loading} />;
  if (query.error) return <Empty label={t.admin.error} />;
  if (!query.data?.length) return <Empty label={t.admin.cases.empty} />;

  return (
    <ul className="space-y-3">
      {query.data.map((row) => (
        <li key={row.caseId}>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                <span>
                  {t.admin.cases.case} #{row.caseNumber}
                </span>
                <Badge variant="outline">{t.admin.priority[row.priority]}</Badge>
                <Badge variant="secondary">{t.admin.caseStatus[row.status]}</Badge>
                <Badge variant="outline">{t.admin.source[row.source as keyof typeof t.admin.source]}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 p-4 pt-0 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">{t.admin.cases.subject}:</span>
                <span className="font-medium">{row.subjectName ?? "—"}</span>
                <code className="text-xs text-muted-foreground">{shortId(row.subjectId)}</code>
                <StatusBadge status={row.subjectStatus} />
              </div>
              <p className="text-xs text-muted-foreground">
                {t.admin.cases.reports}: {row.reportCount} · {t.admin.cases.signals}: {row.signalCount} ·{" "}
                {t.admin.cases.opened}: {formatDate(row.createdAt)}
              </p>
              <Button
                size="sm"
                variant="ghost"
                className="rounded-full"
                onClick={() => setOpenCase(openCase === row.caseId ? null : row.caseId)}
              >
                {openCase === row.caseId ? t.admin.cases.hideDetail : t.admin.cases.viewDetail}
              </Button>
              {openCase === row.caseId ? (
                <CaseDetail caseRow={row} permissions={permissions} />
              ) : null}
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------- appeals */
export function AppealsPanel({ enabled, permissions }: { enabled: boolean; permissions: string[] }) {
  const { t } = useI18n();
  const formatDate = useDate();
  const query = useAppeals(enabled);
  const { decideAppeal } = useModerationActions();
  const canDecide = permissions.includes("appeals.decide");

  async function decide(appealId: string, status: AppealStatus) {
    try {
      await decideAppeal.mutateAsync({ appealId, status });
      toast.success(t.admin.appeals.decided);
    } catch {
      toast.error(t.admin.error);
    }
  }

  if (query.isPending) return <Pending label={t.admin.loading} />;
  if (query.error) return <Empty label={t.admin.error} />;
  if (!query.data?.length) return <Empty label={t.admin.appeals.empty} />;

  return (
    <ul className="space-y-3">
      {query.data.map((appeal) => (
        <li key={appeal.id}>
          <Card>
            <CardContent className="space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{appeal.firstName ?? "—"}</span>
                <code className="text-xs text-muted-foreground">{shortId(appeal.profileId)}</code>
                <StatusBadge status={appeal.accountStatus} />
                <Badge variant="outline">{t.admin.appeals.statusLabels[appeal.status]}</Badge>
              </div>
              <p className="text-sm">{appeal.body}</p>
              <p className="text-xs text-muted-foreground">
                {t.admin.appeals.filed}: {formatDate(appeal.createdAt)}
              </p>
              {canDecide && (appeal.status === "pending" || appeal.status === "reviewing") ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full"
                    onClick={() => void decide(appeal.id, "reviewing")}
                  >
                    {t.admin.appeals.reviewing}
                  </Button>
                  <Button
                    size="sm"
                    className="rounded-full"
                    onClick={() => void decide(appeal.id, "granted")}
                  >
                    {t.admin.appeals.granted}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="rounded-full"
                    onClick={() => void decide(appeal.id, "denied")}
                  >
                    {t.admin.appeals.denied}
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}

/* --------------------------------------------------------------------- audit */
export function AuditPanel({ enabled }: { enabled: boolean }) {
  const { t } = useI18n();
  const { locale } = useI18n();
  const query = useAuditLog(enabled);

  if (query.isPending) return <Pending label={t.admin.loading} />;
  if (query.error) return <Empty label={t.admin.error} />;
  if (!query.data?.length) return <Empty label={t.admin.audit.empty} />;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t.admin.audit.immutable}</p>
      <ul className="space-y-2">
        {query.data.map((entry) => (
          <li key={entry.id} className="rounded-lg border border-border p-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <code className="font-medium">{entry.action}</code>
              <span className="text-muted-foreground">
                {new Date(entry.createdAt).toLocaleString(locale === "ar" ? "ar" : "en")}
              </span>
            </div>
            <p className="mt-1 text-muted-foreground">
              {t.admin.audit.actor}: {entry.actorName ?? shortId(entry.actorId) ?? t.admin.audit.system} ·{" "}
              {t.admin.audit.target}: {entry.targetType}/{shortId(entry.targetId)}
            </p>
            {entry.reason ? (
              <p className="mt-1">
                {t.admin.audit.reason}: {entry.reason}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
