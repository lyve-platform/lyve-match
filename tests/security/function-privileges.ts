/**
 * LYVE least-privilege audit for database routines.
 *
 * Continuous check (CI gate) that:
 *  - no SECURITY DEFINER routine is executable by the anonymous role,
 *  - no admin_* routine is reachable without signing in,
 *  - internal billing/alert writers are reachable by the service role only,
 *  - the security monitoring surface is closed to anonymous callers,
 *  - privileged activity raises a security alert that only staff can read.
 *
 * Run:  bun run tests/security/function-privileges.ts   (or via run-all.ts)
 */
import { createClient } from "@supabase/supabase-js";
import { privilegeViolations, type FunctionPrivilege } from "../../src/lib/security-monitoring-core";

const url = process.env["SUPABASE_URL"]!;
const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
if (!url || !publishableKey || !serviceKey) {
  console.error("Missing SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const anon = createClient(url, publishableKey, { auth: { persistSession: false } });

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, evidence: unknown = "") {
  if (ok) {
    passed += 1;
    console.log(`PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${name} ${evidence ? `→ ${JSON.stringify(evidence)}` : ""}`);
  }
}

// The report routine itself is permission-gated, so the audit reads the
// catalog through the service role.
const { data: rows, error } = await admin.rpc("security_privilege_audit");

check("privilege catalog is readable by the service role", !error, error?.message);

const catalog: FunctionPrivilege[] = ((rows ?? []) as Array<Record<string, unknown>>).map((r) => ({
  functionName: String(r["function_name"]),
  arguments: String(r["arguments"] ?? ""),
  securityType: r["security_type"] === "definer" ? "definer" : "invoker",
  anonExecute: Boolean(r["anon_execute"]),
  authenticatedExecute: Boolean(r["authenticated_execute"]),
  serviceRoleExecute: Boolean(r["service_role_execute"]),
}));

{
  const violations = privilegeViolations(catalog);
  check("no least-privilege violations across public routines", violations.length === 0, violations);
  check("catalog is non-trivial", catalog.length > 20, catalog.length);
}

// Anonymous callers must not reach any privileged surface, whatever the
// catalog says.
const anonProbes: Array<[string, Record<string, unknown>]> = [
  ["admin_function_privilege_report", {}],
  ["security_privilege_audit", {}],
  ["admin_list_security_alerts", { p_limit: 1 }],
  ["admin_acknowledge_security_alert", { p_alert: "00000000-0000-0000-0000-000000000000" }],
  ["admin_list_audit", { p_limit: 1 }],
  ["admin_set_role", {
    p_target: "00000000-0000-0000-0000-000000000000",
    p_role: "super_admin",
    p_grant: true,
  }],
  ["record_security_alert", {
    p_kind: "probe",
    p_severity: "critical",
    p_actor: null,
    p_target: null,
    p_summary: "probe",
  }],
];

for (const [fn, args] of anonProbes) {
  const { error: probeError } = await anon.rpc(fn, args);
  check(`anon cannot execute ${fn}`, Boolean(probeError), probeError?.message ?? "no error");
}

// Anonymous callers must not read the alert log directly either.
const { data: anonAlerts, error: anonAlertError } = await anon
  .from("security_alerts")
  .select("id")
  .limit(1);
check(
  "anon cannot read security_alerts",
  Boolean(anonAlertError) || (anonAlerts ?? []).length === 0,
  anonAlertError?.message,
);

// Monitoring must actually fire on privileged activity.
const probeKind = `test.probe.${Date.now()}`;
const { data: alertId, error: writeError } = await admin.rpc("record_security_alert", {
  p_kind: probeKind,
  p_severity: "info",
  p_actor: null,
  p_target: null,
  p_summary: "Automated least-privilege audit probe",
  p_metadata: { source: "ci" },
});
check("service role can record an alert", !writeError && Boolean(alertId), writeError?.message);

if (alertId) {
  const { data: stored } = await admin
    .from("security_alerts")
    .select("kind, severity, acknowledged_at")
    .eq("id", alertId as string)
    .maybeSingle();
  check("alert is persisted unacknowledged", stored?.kind === probeKind && !stored?.acknowledged_at);
  await admin.from("security_alerts").delete().eq("id", alertId as string);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
