import { Link, createFileRoute } from "@tanstack/react-router";
import { useI18n } from "@/i18n";
import { useAdminSession } from "@/hooks/useAdmin";
import { useLocalizationSetting, useSetArabicEnabled } from "@/hooks/useLocalizationAdmin";
import { AccountShell } from "@/components/lyve/AccountShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  head: () => ({
    meta: [
      { title: "Platform settings — LYVE staff console" },
      {
        name: "description",
        content: "Internal LYVE platform configuration, including language availability.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Platform settings — LYVE staff console" },
      { property: "og:description", content: "Internal LYVE platform configuration." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminSettingsPage,
});

function AdminSettingsPage() {
  const { t } = useI18n();
  const session = useAdminSession();
  const isStaff = session.data?.isStaff === true;
  const permissions = session.data?.permissions ?? [];
  const canEdit = permissions.includes("settings.localization");

  const setting = useLocalizationSetting(isStaff);
  const toggle = useSetArabicEnabled();

  if (session.isPending) {
    return (
      <AccountShell title={t.adminSettings.title} subtitle={t.adminSettings.subtitle}>
        <p className="text-sm text-muted-foreground">{t.adminSettings.loading}</p>
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

  const enabled = setting.data?.arabicEnabled === true;
  const updatedAt = setting.data?.updatedAt;

  return (
    <AccountShell title={t.adminSettings.title} subtitle={t.adminSettings.subtitle}>
      <Button asChild variant="ghost" size="sm" className="w-fit rounded-full">
        <Link to="/admin">{t.adminSettings.back}</Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>{t.adminSettings.localization}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {setting.isPending ? (
            <p className="text-sm text-muted-foreground">{t.adminSettings.loading}</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                  <Label htmlFor="arabic-toggle" className="text-base">
                    {t.adminSettings.arabicLabel}
                  </Label>
                  <p className="max-w-prose text-sm text-muted-foreground">
                    {t.adminSettings.arabicHelp}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={enabled ? "default" : "secondary"}>
                    {enabled ? t.adminSettings.enabled : t.adminSettings.disabled}
                  </Badge>
                  <Switch
                    id="arabic-toggle"
                    checked={enabled}
                    disabled={!canEdit || toggle.isPending}
                    onCheckedChange={(next) => toggle.mutate(next)}
                  />
                </div>
              </div>

              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">{t.adminSettings.status}</dt>
                  <dd>{enabled ? t.adminSettings.enabled : t.adminSettings.disabled}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t.adminSettings.lastChanged}</dt>
                  <dd>
                    {updatedAt && setting.data?.updatedBy
                      ? new Date(updatedAt).toLocaleString()
                      : t.adminSettings.never}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t.adminSettings.changedBy}</dt>
                  <dd>
                    {setting.data?.updatedBy
                      ? (setting.data.updatedByName ?? setting.data.updatedBy)
                      : t.adminSettings.system}
                  </dd>
                </div>
              </dl>

              {!canEdit ? (
                <p className="text-sm text-muted-foreground">{t.adminSettings.denied}</p>
              ) : null}
              {toggle.isError ? (
                <p className="text-sm text-destructive">{t.adminSettings.failed}</p>
              ) : null}
              {toggle.isSuccess ? (
                <p className="text-sm text-muted-foreground">{t.adminSettings.saved}</p>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </AccountShell>
  );
}
