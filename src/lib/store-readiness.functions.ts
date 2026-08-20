/**
 * Store readiness server function (staff only).
 *
 * Read-only production-readiness view for the Apple and Google rails.
 * Authorisation is a real `billing.view` permission check performed with the
 * CALLER's client, so the role tables decide.
 *
 * The projection is deliberately credential-free: it reports only WHETHER a
 * credential set resolves, never a key, issuer, bundle id, package name or any
 * fragment of a secret. Failure reasons are the same stable codes the
 * verifiers use, so the page can never disagree with the runtime.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ReadinessState = "ready" | "sandbox" | "blocked" | "misconfigured";

export type StoreReadinessRow = {
  store: "apple" | "google";
  /** api = real store API + signature verification, hmac = sandbox test rail. */
  rail: "api" | "hmac" | "none";
  /** Stable configuration code, never a credential value. */
  credentials: "CONFIGURED" | "NOT_CONFIGURED" | "CREDENTIAL_MISPLACED" | "INVALID_CREDENTIAL";
  /** True when credentials for the OTHER environment are present. */
  misplaced: boolean;
  webhookPath: string;
  /** Whether the notification endpoint can currently authenticate a caller. */
  webhookVerifies: boolean;
  state: ReadinessState;
  /** Machine-readable next-step keys, resolved to copy in the UI. */
  nextSteps: string[];
};

export type StoreReadiness = {
  environment: "sandbox" | "production";
  productionBillingActive: boolean;
  stores: StoreReadinessRow[];
  lastReconciliation: { startedAt: string; finishedAt: string | null; failed: number } | null;
  openCriticalAlerts: number;
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

export const storeReadiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StoreReadiness> => {
    await requirePermission(context.supabase as never, context.userId, "billing.view");

    const {
      appleConfig,
      googleConfig,
      appleRail,
      googleRail,
      configuredStoreEnvironment,
      hasMisplacedAppleCredentials,
      hasMisplacedGoogleCredentials,
    } = await import("@/lib/billing/store-env.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const environment = configuredStoreEnvironment();

    const describe = (
      store: "apple" | "google",
      result: { ok: boolean; reason?: string },
      rail: "api" | "hmac" | "none",
      misplaced: boolean,
    ): StoreReadinessRow => {
      const credentials = result.ok
        ? ("CONFIGURED" as const)
        : ((result.reason ?? "NOT_CONFIGURED") as StoreReadinessRow["credentials"]);

      const state: ReadinessState =
        credentials === "CREDENTIAL_MISPLACED" || credentials === "INVALID_CREDENTIAL"
          ? "misconfigured"
          : rail === "api" && environment === "production"
            ? "ready"
            : rail === "none"
              ? "blocked"
              : "sandbox";

      const nextSteps: string[] = [];
      if (credentials === "CREDENTIAL_MISPLACED") nextSteps.push("removeOtherEnvCredentials");
      if (credentials === "INVALID_CREDENTIAL") nextSteps.push("fixCredentialFormat");
      if (credentials === "NOT_CONFIGURED") nextSteps.push("storeCredentials");
      if (credentials === "CONFIGURED" && environment !== "production")
        nextSteps.push("flipEnvironment");
      if (state !== "ready") nextSteps.push("keepGatesClosed");
      if (credentials === "CONFIGURED") nextSteps.push("pointWebhookAtProduction");

      return {
        store,
        rail,
        credentials,
        misplaced,
        webhookPath: `/api/public/webhooks/${store}`,
        webhookVerifies: rail !== "none",
        state,
        nextSteps,
      };
    };

    const stores = [
      describe("apple", appleConfig(), appleRail(), hasMisplacedAppleCredentials()),
      describe("google", googleConfig(), googleRail(), hasMisplacedGoogleCredentials()),
    ];

    const [{ data: runs }, { data: alerts }] = await Promise.all([
      supabaseAdmin
        .from("store_reconciliation_runs")
        .select("started_at, finished_at, failed")
        .order("started_at", { ascending: false })
        .limit(1),
      supabaseAdmin
        .from("store_alerts")
        .select("kind")
        .eq("severity", "critical")
        .eq("breached", true)
        .limit(100),
    ]);

    const latest = (runs ?? [])[0];

    return {
      environment,
      productionBillingActive:
        environment === "production" && stores.every((row) => row.state === "ready"),
      stores,
      lastReconciliation: latest
        ? { startedAt: latest.started_at, finishedAt: latest.finished_at, failed: latest.failed }
        : null,
      openCriticalAlerts: (alerts ?? []).length,
    };
  });
