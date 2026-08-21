/**
 * Security monitoring panel.
 *
 * Shows privileged-access alerts raised by the database itself plus the
 * least-privilege report for every database routine. Access is enforced by
 * the `security.view` / `security.ack` permissions in the database; the
 * component only hides controls that would be refused anyway.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  acknowledgeSecurityAlert,
  getFunctionPrivilegeReport,
  listSecurityAlerts,
} from "@/lib/security-monitoring.functions";
import { privilegeViolations, severityRank } from "@/lib/security-monitoring-core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const securityKeys = {
  alerts: ["admin", "security", "alerts"] as const,
  privileges: ["admin", "security", "privileges"] as const,
};

export function SecurityPanel({ enabled, canAck }: { enabled: boolean; canAck: boolean }) {
  const queryClient = useQueryClient();
  const fetchAlerts = useServerFn(listSecurityAlerts);
  const fetchPrivileges = useServerFn(getFunctionPrivilegeReport);
  const ack = useServerFn(acknowledgeSecurityAlert);

  const alerts = useQuery({
    queryKey: securityKeys.alerts,
    queryFn: () => fetchAlerts({ data: { unacknowledgedOnly: false } }),
    enabled,
    retry: false,
    refetchInterval: enabled ? 60_000 : false,
  });

  const privileges = useQuery({
    queryKey: securityKeys.privileges,
    queryFn: () => fetchPrivileges(),
    enabled,
    retry: false,
  });

  const acknowledge = useMutation({
    mutationFn: (alertId: string) => ack({ data: { alertId } }),
    onSuccess: () => {
      toast.success("Alert acknowledged");
      void queryClient.invalidateQueries({ queryKey: securityKeys.alerts });
    },
    onError: () => toast.error("Could not acknowledge this alert"),
  });

  const rows = (alerts.data ?? [])
    .slice()
    .sort(
      (a, b) =>
        severityRank(a.severity) - severityRank(b.severity) ||
        b.createdAt.localeCompare(a.createdAt),
    );
  const open = rows.filter((row) => !row.acknowledgedAt).length;
  const violations = privileges.data ? privilegeViolations(privileges.data) : [];
  const definerCount = (privileges.data ?? []).filter((r) => r.securityType === "definer").length;
  const anonCount = (privileges.data ?? []).filter((r) => r.anonExecute).length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Privileged access alerts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Raised automatically on staff role changes, high-privilege admin actions and unusual
            bursts of admin activity. {open} unacknowledged.
          </p>
          {alerts.isPending ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : alerts.error ? (
            <p className="text-sm text-muted-foreground">Alerts are not available for your role.</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No security alerts recorded.</p>
          ) : (
            <ul className="space-y-2">
              {rows.map((alert) => (
                <li key={alert.id} className="rounded-lg border border-border p-3 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={alert.severity === "critical" ? "destructive" : "secondary"}>
                      {alert.severity}
                    </Badge>
                    <code className="font-medium">{alert.kind}</code>
                    <span className="text-muted-foreground">
                      {new Date(alert.createdAt).toLocaleString("en")}
                    </span>
                    {alert.acknowledgedAt ? (
                      <Badge variant="outline">acknowledged</Badge>
                    ) : canAck ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="ms-auto h-7 rounded-full"
                        disabled={acknowledge.isPending}
                        onClick={() => acknowledge.mutate(alert.id)}
                      >
                        Acknowledge
                      </Button>
                    ) : null}
                  </div>
                  <p className="mt-1">{alert.summary}</p>
                  <p className="mt-1 text-muted-foreground">
                    Actor: {alert.actorName ?? alert.actorId?.slice(0, 8) ?? "system"}
                    {alert.targetId ? ` · Target: ${alert.targetId.slice(0, 8)}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Least-privilege report</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {privileges.isPending ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : privileges.error ? (
            <p className="text-sm text-muted-foreground">Report is not available for your role.</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {privileges.data?.length ?? 0} database routines · {definerCount} elevated ·{" "}
                {anonCount} reachable without signing in.
              </p>
              {violations.length === 0 ? (
                <p className="text-sm text-emerald-600 dark:text-emerald-400">
                  No least-privilege violations detected.
                </p>
              ) : (
                <ul className="space-y-1 text-xs text-destructive">
                  {violations.map((problem) => (
                    <li key={problem}>{problem}</li>
                  ))}
                </ul>
              )}
              <div className="max-h-80 overflow-auto rounded-lg border border-border">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="p-2">Routine</th>
                      <th className="p-2">Mode</th>
                      <th className="p-2">anon</th>
                      <th className="p-2">signed-in</th>
                      <th className="p-2">service</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(privileges.data ?? []).map((row) => (
                      <tr key={`${row.functionName}(${row.arguments})`} className="border-t">
                        <td className="p-2 font-mono">{row.functionName}</td>
                        <td className="p-2">{row.securityType}</td>
                        <td className="p-2">{row.anonExecute ? "yes" : "—"}</td>
                        <td className="p-2">{row.authenticatedExecute ? "yes" : "—"}</td>
                        <td className="p-2">{row.serviceRoleExecute ? "yes" : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
