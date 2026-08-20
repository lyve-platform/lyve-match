/**
 * Store operations server functions (staff only).
 *
 * Authorisation is a real permission check against the database
 * (`billing.view` to read health, `billing.grant` to trigger a manual
 * reconciliation pass), performed with the CALLER's client so RLS and the
 * role tables decide — never a client-supplied flag.
 *
 * The read is deliberately narrow: counters and stable failure codes. No
 * purchase tokens, receipts or member identities are exposed.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type StoreAlertRow = {
  kind: string;
  severity: string;
  occurrences: number;
  breached: boolean;
  lastSeenAt: string;
};

export type StoreReconciliationRow = {
  mode: string;
  startedAt: string;
  finishedAt: string | null;
  scanned: number;
  corrected: number;
  failed: number;
};

export type StoreOpsHealth = {
  environment: string;
  rails: { apple: string; google: string };
  alerts: StoreAlertRow[];
  runs: StoreReconciliationRow[];
};

async function requirePermission(
  supabase: { rpc: (name: never, args: never) => Promise<{ data: unknown }> },
  userId: string,
  permission: string,
): Promise<void> {
  const { data } = await supabase.rpc(
    "has_permission" as never,
    {
      _permission: permission,
      _user_id: userId,
    } as never,
  );
  if (data !== true) throw new Error("FORBIDDEN");
}

export const storeOpsHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StoreOpsHealth> => {
    await requirePermission(context.supabase as never, context.userId, "billing.view");

    const { appleRail, googleRail, configuredStoreEnvironment } =
      await import("@/lib/billing/store-env.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: alerts }, { data: runs }] = await Promise.all([
      supabaseAdmin
        .from("store_alerts")
        .select("kind, severity, occurrences, breached, last_seen_at")
        .order("last_seen_at", { ascending: false })
        .limit(25),
      supabaseAdmin
        .from("store_reconciliation_runs")
        .select("mode, started_at, finished_at, scanned, corrected, failed")
        .order("started_at", { ascending: false })
        .limit(10),
    ]);

    return {
      environment: configuredStoreEnvironment(),
      rails: { apple: appleRail(), google: googleRail() },
      alerts: (alerts ?? []).map((row) => ({
        kind: row.kind,
        severity: row.severity,
        occurrences: row.occurrences,
        breached: row.breached,
        lastSeenAt: row.last_seen_at,
      })),
      runs: (runs ?? []).map((row) => ({
        mode: row.mode,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
        scanned: row.scanned,
        corrected: row.corrected,
        failed: row.failed,
      })),
    };
  });

/** Manual reconciliation pass. Takes no target: the work set is our own data. */
export const runStoreReconciliation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requirePermission(context.supabase as never, context.userId, "billing.grant");

    const { consumeRate, RATE_LIMITS } = await import("@/lib/billing/store-ops.server");
    const rate = await consumeRate(`reconcile:manual:${context.userId}`, RATE_LIMITS.reconcile);
    if (!rate.allowed) return { ok: false as const, result: "RATE_LIMITED" as const };

    const { reconcileStorePurchases } = await import("@/lib/billing/store-reconcile.server");
    const summary = await reconcileStorePurchases({ mode: "manual" });
    return { ok: true as const, result: "COMPLETED" as const, summary };
  });
