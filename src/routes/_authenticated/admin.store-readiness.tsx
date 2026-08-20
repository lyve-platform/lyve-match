import { Link, createFileRoute } from "@tanstack/react-router";
import { useI18n } from "@/i18n";
import { useAdminSession } from "@/hooks/useAdmin";
import { useStoreReadiness } from "@/hooks/useStoreReadiness";
import { AccountShell } from "@/components/lyve/AccountShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/admin/store-readiness")({
  head: () => ({
    meta: [
      { title: "Store readiness — LYVE staff console" },
      {
        name: "description",
        content:
          "Apple and Google production rail and webhook configuration status for LYVE billing.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Store readiness — LYVE staff console" },
      {
        property: "og:description",
        content: "Apple and Google billing rail configuration status.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StoreReadinessPage,
});

function StoreReadinessPage() {
  const { t } = useI18n();
  const copy = t.storeReadiness;
  const session = useAdminSession();
  const isStaff = session.data?.isStaff === true;
  const canView = (session.data?.permissions ?? []).includes("billing.view");
  const readiness = useStoreReadiness(isStaff && canView);

  if (session.isPending) {
    return (
      <AccountShell title={copy.title} subtitle={copy.subtitle}>
        <p className="text-sm text-muted-foreground">{copy.loading}</p>
      </AccountShell>
    );
  }

  if (!isStaff || !canView) {
    return (
      <AccountShell title={t.admin.deniedTitle} subtitle={t.admin.deniedBody}>
        <Button asChild variant="outline" className="rounded-full">
          <Link to="/discover">{t.admin.backHome}</Link>
        </Button>
      </AccountShell>
    );
  }

  const data = readiness.data;

  return (
    <AccountShell title={copy.title} subtitle={copy.subtitle}>
      <Button asChild variant="ghost" size="sm" className="w-fit rounded-full">
        <Link to="/admin">{copy.back}</Link>
      </Button>

      {readiness.isPending ? (
        <p className="text-sm text-muted-foreground">{copy.loading}</p>
      ) : readiness.isError || !data ? (
        <p className="text-sm text-destructive">{copy.error}</p>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{copy.overview}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <p className="text-muted-foreground">{copy.environment}</p>
                <p>
                  <Badge variant={data.environment === "production" ? "default" : "secondary"}>
                    {copy.environments[data.environment]}
                  </Badge>
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">{copy.productionBilling}</p>
                <p>{data.productionBillingActive ? copy.active : copy.notActive}</p>
              </div>
              <div>
                <p className="text-muted-foreground">{copy.criticalAlerts}</p>
                <p>{data.openCriticalAlerts}</p>
              </div>
              <div className="sm:col-span-3">
                <p className="text-muted-foreground">{copy.lastReconciliation}</p>
                <p>
                  {data.lastReconciliation
                    ? `${new Date(data.lastReconciliation.startedAt).toLocaleString()} · ${copy.failed}: ${data.lastReconciliation.failed}`
                    : copy.never}
                </p>
              </div>
            </CardContent>
          </Card>

          {data.stores.map((row) => (
            <Card key={row.store}>
              <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
                <CardTitle>{copy.stores[row.store]}</CardTitle>
                <Badge
                  variant={
                    row.state === "ready"
                      ? "default"
                      : row.state === "sandbox"
                        ? "secondary"
                        : "destructive"
                  }
                >
                  {copy.states[row.state]}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">{copy.credentials}</dt>
                    <dd>{copy.credentialStates[row.credentials]}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{copy.rail}</dt>
                    <dd>{copy.rails[row.rail]}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{copy.webhook}</dt>
                    <dd className="font-mono text-xs">{row.webhookPath}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{copy.webhookStatus}</dt>
                    <dd>{row.webhookVerifies ? copy.webhookVerifying : copy.webhookFailClosed}</dd>
                  </div>
                </dl>

                <div className="space-y-2">
                  <p className="text-sm font-medium">{copy.nextSteps}</p>
                  <ul className="list-disc space-y-1 ps-5 text-sm text-muted-foreground">
                    {row.nextSteps.map((step) => (
                      <li key={step}>{copy.steps[step as keyof typeof copy.steps] ?? step}</li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          ))}

          <p className="text-xs text-muted-foreground">{copy.credentialNotice}</p>
        </>
      )}
    </AccountShell>
  );
}
