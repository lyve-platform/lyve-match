/**
 * Server-side reconciliation for missed / lost store notifications. SERVER ONLY.
 *
 * Notifications are best-effort: Apple and Google both drop, delay and
 * duplicate them. Reconciliation makes the store — not the delivery channel —
 * the source of truth, by re-reading state for purchases WE already know about.
 *
 * Safety properties:
 *   - Input is never a client value. Purchase references come from our own
 *     `store_purchases` rows, so reconciliation cannot be steered.
 *   - Idempotent: each pass derives a deterministic event id from the store's
 *     own state, so re-running changes nothing.
 *   - Never resurrects access: a refunded / revoked purchase is skipped, so a
 *     stale store read can never hand entitlements back.
 *   - Ordering-safe: application goes through the same database routine as
 *     webhooks, which refuses out-of-order events.
 */
import { createHash } from "node:crypto";
import type { Database } from "@/integrations/supabase/types";
import { productFor, type StoreId, type StoreSnapshot, type VerifiedStoreEvent } from "./store-core";
import { appleRail, configuredStoreEnvironment, googleRail } from "./store-env.server";
import { fetchAppleSubscriptionState } from "./apple-store.server";
import { fetchGoogleSubscriptionState } from "./google-store.server";
import { applyVerifiedStoreEvent } from "./store.server";
import { raiseStoreAlert, refDigest } from "./store-ops.server";

type Provider = Database["public"]["Enums"]["billing_provider"];

export type ReconcileMode = "scheduled" | "manual";

export type ReconcileSummary = {
  mode: ReconcileMode;
  scanned: number;
  corrected: number;
  unchanged: number;
  skippedRevoked: number;
  failed: number;
  rails: { apple: string; google: string };
};

/** Purchases untouched for this long are candidates for a re-read. */
export const RECONCILE_STALE_MINUTES = 60;
export const RECONCILE_BATCH = 50;

/** Deterministic, store-derived idempotency key. Same state → same id. */
export function reconciliationEventId(snapshot: StoreSnapshot): string {
  const digest = createHash("sha256")
    .update(`${snapshot.store}|${snapshot.purchaseRef}|${snapshot.stateToken}`)
    .digest("hex")
    .slice(0, 32);
  return `recon:${snapshot.store}:${digest}`;
}

export function snapshotToEvent(snapshot: StoreSnapshot, now = new Date()): VerifiedStoreEvent | null {
  if (!productFor(snapshot.store, snapshot.productId)) return null;
  return {
    store: snapshot.store,
    eventId: reconciliationEventId(snapshot),
    eventType: `reconciliation:${snapshot.lifecycle.reason}`,
    eventAt: now.toISOString(),
    purchaseRef: snapshot.purchaseRef,
    productId: snapshot.productId,
    environment: snapshot.environment,
    periodStart: snapshot.periodStart,
    periodEnd: snapshot.periodEnd,
    lifecycle: snapshot.lifecycle,
  };
}

async function readSnapshot(store: StoreId, purchaseRef: string) {
  return store === "apple"
    ? fetchAppleSubscriptionState(purchaseRef)
    : fetchGoogleSubscriptionState(purchaseRef);
}

/**
 * One reconciliation pass. Returns a summary; per-purchase detail lives in the
 * billing ledger and the alert table, never in the response.
 */
export async function reconcileStorePurchases(
  options: { mode?: ReconcileMode; limit?: number; staleMinutes?: number } = {},
): Promise<ReconcileSummary> {
  const mode = options.mode ?? "scheduled";
  const limit = Math.min(Math.max(options.limit ?? RECONCILE_BATCH, 1), 200);
  const staleMinutes = Math.max(options.staleMinutes ?? RECONCILE_STALE_MINUTES, 1);
  const environment = configuredStoreEnvironment();
  const rails = { apple: appleRail(), google: googleRail() };

  const summary: ReconcileSummary = {
    mode,
    scanned: 0,
    corrected: 0,
    unchanged: 0,
    skippedRevoked: 0,
    failed: 0,
    rails,
  };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: run } = await supabaseAdmin
    .from("store_reconciliation_runs")
    .insert({ mode })
    .select("id")
    .single();

  const enabled = (["apple", "google"] as const).filter((store) => rails[store] === "api");
  if (enabled.length === 0) {
    await finishRun(run?.id, summary, "no_store_api_configured");
    return summary;
  }

  const cutoff = new Date(Date.now() - staleMinutes * 60_000).toISOString();
  const { data: rows, error } = await supabaseAdmin
    .from("store_purchases")
    .select("id, provider, purchase_ref, revoked_at, status, environment")
    .in("provider", enabled as unknown as Provider[])
    .eq("environment", environment)
    .or(`last_reconciled_at.is.null,last_reconciled_at.lt.${cutoff}`)
    .order("last_reconciled_at", { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) {
    await raiseStoreAlert("store_reconciliation_failure", "query", { reason: "query_failed" });
    await finishRun(run?.id, summary, "query_failed");
    return summary;
  }

  for (const row of rows ?? []) {
    summary.scanned += 1;
    const store = row.provider as StoreId;

    if (row.revoked_at) {
      // Never resurrect a refunded or revoked purchase from a store read.
      summary.skippedRevoked += 1;
      await touch(row.id);
      continue;
    }

    const snapshot = await readSnapshot(store, row.purchase_ref);
    if (!snapshot.ok) {
      summary.failed += 1;
      await raiseStoreAlert("store_reconciliation_failure", `${store}:${refDigest(row.purchase_ref)}`, {
        store,
        reason: snapshot.reason,
        ref_digest: refDigest(row.purchase_ref),
      });
      continue;
    }

    if (snapshot.snapshot.environment !== environment) {
      summary.failed += 1;
      await raiseStoreAlert("store_reconciliation_drift", `${store}:environment`, {
        store,
        reason: "environment_mismatch",
      });
      continue;
    }

    const event = snapshotToEvent(snapshot.snapshot);
    if (!event) {
      summary.failed += 1;
      continue;
    }

    try {
      const result = await applyVerifiedStoreEvent(event);
      if (result === "PROCESSED") {
        summary.corrected += 1;
        if (snapshot.snapshot.lifecycle.status !== row.status) {
          await raiseStoreAlert("store_reconciliation_drift", `${store}:${refDigest(row.purchase_ref)}`, {
            store,
            reason: "status_drift",
            status: snapshot.snapshot.lifecycle.status,
            ref_digest: refDigest(row.purchase_ref),
          });
        }
      } else {
        summary.unchanged += 1;
      }
      await touch(row.id);
    } catch {
      summary.failed += 1;
      await raiseStoreAlert("store_reconciliation_failure", `${store}:${refDigest(row.purchase_ref)}`, {
        store,
        reason: "apply_failed",
        ref_digest: refDigest(row.purchase_ref),
      });
    }
  }

  await finishRun(run?.id, summary, null);
  return summary;

  async function touch(id: string) {
    await supabaseAdmin
      .from("store_purchases")
      .update({ last_reconciled_at: new Date().toISOString() })
      .eq("id", id);
  }

  async function finishRun(id: string | undefined, result: ReconcileSummary, note: string | null) {
    if (!id) return;
    await supabaseAdmin
      .from("store_reconciliation_runs")
      .update({
        finished_at: new Date().toISOString(),
        scanned: result.scanned,
        corrected: result.corrected,
        unchanged: result.unchanged,
        skipped_revoked: result.skippedRevoked,
        failed: result.failed,
        notes: note ? { note } : {},
      })
      .eq("id", id);
  }
}
