/**
 * Admin billing panel.
 *
 * Permissions here only hide controls that the database would refuse anyway.
 * The restricted projection for `billing.view.limited` is produced server-side,
 * so a limited role cannot recover provider references by editing this client.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useI18n } from "@/i18n";
import {
  adminBillingOverview,
  adminGrantEntitlement,
  adminListEntitlements,
  adminRevokeEntitlement,
} from "@/lib/billing-admin.functions";
import { ADMIN_GRANT_MAX_DAYS, ADMIN_GRANT_MIN_DAYS } from "@/lib/billing-core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function AdminBillingPanel({
  enabled,
  permissions,
}: {
  enabled: boolean;
  permissions: string[];
}) {
  const { t } = useI18n();
  const copy = t.adminBilling;
  const queryClient = useQueryClient();

  const canGrant = permissions.includes("billing.grant");
  const limitedOnly =
    !permissions.includes("billing.view") && permissions.includes("billing.view.limited");

  const overviewFn = useServerFn(adminBillingOverview);
  const listFn = useServerFn(adminListEntitlements);
  const grantFn = useServerFn(adminGrantEntitlement);
  const revokeFn = useServerFn(adminRevokeEntitlement);

  const [profileId, setProfileId] = useState("");
  const [reason, setReason] = useState("");
  const [days, setDays] = useState("30");

  const overview = useQuery({
    queryKey: ["admin", "billing", "overview"],
    queryFn: () => overviewFn({ data: { profileId: null } }),
    enabled,
    retry: false,
  });

  const entitlements = useQuery({
    queryKey: ["admin", "billing", "entitlements", profileId],
    queryFn: () => listFn({ data: { profileId } }),
    enabled: enabled && /^[0-9a-f-]{36}$/i.test(profileId),
    retry: false,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin", "billing"] });

  const grant = useMutation({
    mutationFn: () => grantFn({ data: { profileId, key: "premium", days: Number(days), reason } }),
    onSuccess: () => {
      toast.success(copy.grant.granted);
      setReason("");
      void refresh();
    },
    onError: (error: Error) => {
      const key = error.message as keyof typeof copy.grant.errors;
      toast.error(copy.grant.errors[key] ?? copy.grant.errors.GENERIC);
    },
  });

  const revoke = useMutation({
    mutationFn: (entitlementId: string) =>
      revokeFn({ data: { entitlementId, reason: reason || "Revoked by staff" } }),
    onSuccess: () => {
      toast.success(copy.grant.revoked);
      void refresh();
    },
    onError: () => toast.error(copy.grant.errors.GENERIC),
  });

  const date = (value: string | null) =>
    value
      ? new Date(value).toLocaleDateString("en", { dateStyle: "medium" })
      : "—";

  return (
    <div className="space-y-6">
      {limitedOnly ? (
        <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          {copy.limitedNotice}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{copy.title}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {overview.isPending ? (
            <p className="py-6 text-sm text-muted-foreground">{copy.loading}</p>
          ) : (overview.data ?? []).length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">{copy.empty}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-start">
                  <th scope="col" className="py-2 text-start font-medium">
                    {copy.columns.member}
                  </th>
                  <th scope="col" className="py-2 text-start font-medium">
                    {copy.columns.plan}
                  </th>
                  <th scope="col" className="py-2 text-start font-medium">
                    {copy.columns.status}
                  </th>
                  <th scope="col" className="py-2 text-start font-medium">
                    {copy.columns.provider}
                  </th>
                  <th scope="col" className="py-2 text-start font-medium">
                    {copy.columns.periodEnd}
                  </th>
                  <th scope="col" className="py-2 text-start font-medium">
                    {copy.columns.reference}
                  </th>
                </tr>
              </thead>
              <tbody>
                {(overview.data ?? []).map((row) => (
                  <tr
                    key={`${row.profileId}-${row.createdAt}`}
                    className="border-b border-border/60"
                  >
                    <td className="py-2 font-mono text-xs">{row.profileId.slice(0, 8)}</td>
                    <td className="py-2">{row.planCode}</td>
                    <td className="py-2">
                      <Badge variant="secondary">{t.premiumPage.status[row.status]}</Badge>
                    </td>
                    <td className="py-2">{row.provider}</td>
                    <td className="py-2">{date(row.currentPeriodEnd)}</td>
                    <td className="py-2 font-mono text-xs">{row.providerSubscriptionId ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {canGrant ? (
        <Card>
          <CardHeader>
            <CardTitle>{copy.grant.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="grant-profile">{copy.grant.profileId}</Label>
              <Input
                id="grant-profile"
                value={profileId}
                onChange={(event) => setProfileId(event.target.value.trim())}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="grant-days">{copy.grant.days}</Label>
              <Input
                id="grant-days"
                type="number"
                min={ADMIN_GRANT_MIN_DAYS}
                max={ADMIN_GRANT_MAX_DAYS}
                value={days}
                onChange={(event) => setDays(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">{copy.grant.daysHint}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="grant-reason">{copy.grant.reason}</Label>
              <Textarea
                id="grant-reason"
                rows={2}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">{copy.grant.reasonHint}</p>
            </div>
            <Button
              className="rounded-full"
              disabled={grant.isPending}
              onClick={() => grant.mutate()}
            >
              {copy.grant.submit}
            </Button>

            {(entitlements.data ?? []).length > 0 ? (
              <ul className="space-y-2 pt-2">
                {(entitlements.data ?? []).map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm"
                  >
                    <span>
                      {row.key} · {date(row.expiresAt)} {row.revokedAt ? "· revoked" : ""}
                    </span>
                    {row.revokedAt ? null : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full"
                        disabled={revoke.isPending}
                        onClick={() => revoke.mutate(row.id)}
                      >
                        {copy.grant.revoke}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
