import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useI18n } from "@/i18n";
import { useAdminSession } from "@/hooks/useAdmin";
import { AccountShell } from "@/components/lyve/AccountShell";
import {
  AppealsPanel,
  AuditPanel,
  CasesPanel,
  OverviewPanel,
  UsersPanel,
} from "@/components/lyve/AdminPanels";
import { AdminBillingPanel } from "@/components/lyve/AdminBillingPanel";
import { AdminStaffPanel } from "@/components/lyve/AdminStaffPanel";
import { AdminSupportPanel } from "@/components/lyve/AdminSupportPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "Trust & Safety — LYVE staff console" },
      {
        name: "description",
        content:
          "Internal LYVE Trust & Safety console for moderation cases, account standing and the administrative audit trail.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Trust & Safety — LYVE staff console" },
      {
        property: "og:description",
        content: "Internal LYVE moderation, account standing and audit tooling.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { t } = useI18n();
  const session = useAdminSession();
  const [tab, setTab] = useState("overview");

  const isStaff = session.data?.isStaff === true;
  const permissions = session.data?.permissions ?? [];

  if (session.isPending) {
    return (
      <AccountShell title={t.admin.title} subtitle={t.admin.subtitle}>
        <p className="text-sm text-muted-foreground">{t.admin.loading}</p>
      </AccountShell>
    );
  }

  if (!isStaff) {
    return (
      <AccountShell title={t.admin.deniedTitle} subtitle={t.admin.deniedBody}>
        <Button asChild variant="outline" className="rounded-full">
          <Link to="/discover">{t.admin.backHome}</Link>
        </Button>
      </AccountShell>
    );
  }

  const canSeeUsers = permissions.includes("users.view");
  const canSeeCases = permissions.includes("cases.view");
  const canSeeAppeals = permissions.includes("appeals.view");
  const canSeeAudit = permissions.includes("audit.view");
  const canSeeMetrics = permissions.includes("metrics.view");
  const canManageRoles = permissions.includes("roles.manage");
  const canSeeSupport = permissions.includes("support.tickets.view");
  const canSeeBilling =
    permissions.includes("billing.view") || permissions.includes("billing.view.limited");

  return (
    <AccountShell title={t.admin.title} subtitle={t.admin.subtitle} wide>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">{t.admin.yourRoles}:</span>
        {(session.data?.roles ?? []).map((role) => (
          <Badge key={role} variant="secondary">
            {t.admin.roles[role]}
          </Badge>
        ))}
        <Button asChild variant="outline" size="sm" className="ms-auto rounded-full">
          <Link to="/admin/store-readiness">{t.storeReadiness.link}</Link>
        </Button>
        <Button asChild size="sm" className="rounded-full">
          <Link to="/admin/settings">{t.adminSettings.link}</Link>
        </Button>
      </div>


      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="flex w-full flex-wrap justify-start">
          {canSeeMetrics ? <TabsTrigger value="overview">{t.admin.tabs.overview}</TabsTrigger> : null}
          {canSeeCases ? <TabsTrigger value="cases">{t.admin.tabs.cases}</TabsTrigger> : null}
          {canSeeUsers ? <TabsTrigger value="users">{t.admin.tabs.users}</TabsTrigger> : null}
          {canSeeAppeals ? <TabsTrigger value="appeals">{t.admin.tabs.appeals}</TabsTrigger> : null}
          {canSeeBilling ? <TabsTrigger value="billing">{t.adminBilling.tab}</TabsTrigger> : null}
          {canSeeSupport ? (
            <TabsTrigger value="support">{t.adminSupport.title}</TabsTrigger>
          ) : null}
          {canSeeAudit ? <TabsTrigger value="audit">{t.admin.tabs.audit}</TabsTrigger> : null}
          {canManageRoles ? <TabsTrigger value="staff">{t.admin.tabs.staff}</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <OverviewPanel enabled={canSeeMetrics && tab === "overview"} />
        </TabsContent>
        <TabsContent value="cases" className="mt-6">
          <CasesPanel enabled={canSeeCases && tab === "cases"} permissions={permissions} />
        </TabsContent>
        <TabsContent value="users" className="mt-6">
          <UsersPanel enabled={canSeeUsers && tab === "users"} />
        </TabsContent>
        <TabsContent value="appeals" className="mt-6">
          <AppealsPanel enabled={canSeeAppeals && tab === "appeals"} permissions={permissions} />
        </TabsContent>
        <TabsContent value="billing" className="mt-6">
          <AdminBillingPanel enabled={canSeeBilling && tab === "billing"} permissions={permissions} />
        </TabsContent>
        <TabsContent value="support" className="mt-6">
          <AdminSupportPanel
            enabled={canSeeSupport && tab === "support"}
            permissions={permissions}
          />
        </TabsContent>
        <TabsContent value="audit" className="mt-6">
          <AuditPanel enabled={canSeeAudit && tab === "audit"} />
        </TabsContent>
        <TabsContent value="staff" className="mt-6">
          <AdminStaffPanel enabled={canManageRoles && tab === "staff"} />
        </TabsContent>
      </Tabs>
    </AccountShell>
  );
}
