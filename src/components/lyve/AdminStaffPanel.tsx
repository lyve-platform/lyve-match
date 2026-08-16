import { useState } from "react";
import { useI18n } from "@/i18n";
import { useSetStaffRole, useStaffRoles } from "@/hooks/useAdmin";
import { ADMIN_ROLES, type AdminRole } from "@/lib/admin-core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Staff role management. Display only — `admin_set_role` re-checks the
 * `roles.manage` permission inside the database on every call, and refuses
 * self-service role changes.
 */
export function AdminStaffPanel({ enabled }: { enabled: boolean }) {
  const { t } = useI18n();
  const staff = useStaffRoles(enabled);
  const setRole = useSetStaffRole();

  const [targetId, setTargetId] = useState("");
  const [role, setRole_] = useState<AdminRole>("moderator");

  const canSubmit = targetId.trim().length === 36 && !setRole.isPending;

  return (
    <div className="space-y-8">
      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground">
          {t.admin.staff.title}
        </h3>
        {staff.isError ? (
          <p className="mt-3 text-sm text-destructive">{t.admin.error}</p>
        ) : staff.data && staff.data.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {staff.data.map((row) => (
              <li
                key={`${row.userId}-${row.role}`}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-4"
              >
                <span className="font-mono text-xs text-muted-foreground">{row.userId}</span>
                <Badge variant="secondary">{t.admin.roles[row.role]}</Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(row.createdAt).toLocaleDateString()}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="ms-auto rounded-full"
                  disabled={setRole.isPending}
                  onClick={() =>
                    setRole.mutate({ targetId: row.userId, role: row.role, grant: false })
                  }
                >
                  {t.admin.staff.revoke}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">{t.admin.staff.empty}</p>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h3 className="text-sm font-semibold text-foreground">{t.admin.staff.grantTitle}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{t.admin.staff.note}</p>
        <form
          className="mt-4 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit) setRole.mutate({ targetId: targetId.trim(), role, grant: true });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="staff-target">{t.admin.staff.memberId}</Label>
            <Input
              id="staff-target"
              value={targetId}
              placeholder="00000000-0000-0000-0000-000000000000"
              onChange={(event) => setTargetId(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="staff-role">{t.admin.staff.role}</Label>
            <select
              id="staff-role"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
              value={role}
              onChange={(event) => setRole_(event.target.value as AdminRole)}
            >
              {ADMIN_ROLES.map((value) => (
                <option key={value} value={value}>
                  {t.admin.roles[value]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" className="rounded-full" disabled={!canSubmit}>
              {t.admin.staff.grant}
            </Button>
            {setRole.isError ? (
              <span className="text-sm text-destructive">{t.admin.staff.failed}</span>
            ) : null}
            {setRole.isSuccess ? (
              <span className="text-sm text-muted-foreground">{t.admin.staff.saved}</span>
            ) : null}
          </div>
        </form>
      </section>
    </div>
  );
}
