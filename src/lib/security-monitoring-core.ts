/**
 * Shared types for the LYVE security monitoring surface.
 *
 * Alerts never carry personal data: only actor/target identifiers, an action
 * code, a short summary and structured metadata that the database itself
 * produced. No email, phone, message body or payment data is ever included.
 */

export const ALERT_SEVERITIES = ["info", "warning", "critical"] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export type AlertMetadata = Record<string, string | number | boolean | null>;

export type SecurityAlert = {
  id: string;
  kind: string;
  severity: AlertSeverity;
  actorId: string | null;
  actorName: string | null;
  targetId: string | null;
  summary: string;
  metadata: AlertMetadata;
  createdAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
};

export type FunctionPrivilege = {
  functionName: string;
  arguments: string;
  securityType: "definer" | "invoker";
  anonExecute: boolean;
  authenticatedExecute: boolean;
  serviceRoleExecute: boolean;
};

/**
 * Least-privilege rule set, mirrored by tests/security/function-privileges.ts.
 *
 * A `SECURITY DEFINER` routine that anonymous callers can execute is always a
 * violation. Everything else is reviewed by name prefix.
 */
export function privilegeViolations(rows: FunctionPrivilege[]): string[] {
  const problems: string[] = [];
  for (const row of rows) {
    if (row.securityType === "definer" && row.anonExecute) {
      problems.push(`${row.functionName}: SECURITY DEFINER executable by anon`);
    }
    if (row.functionName.startsWith("admin_") && row.anonExecute) {
      problems.push(`${row.functionName}: admin routine executable by anon`);
    }
    if (row.functionName.startsWith("billing_") && row.authenticatedExecute) {
      problems.push(`${row.functionName}: billing routine executable by signed-in users`);
    }
    if (row.functionName.startsWith("record_security_alert") && row.authenticatedExecute) {
      problems.push(`${row.functionName}: alert writer executable by signed-in users`);
    }
  }
  return problems;
}

export function severityRank(severity: AlertSeverity): number {
  return severity === "critical" ? 0 : severity === "warning" ? 1 : 2;
}
