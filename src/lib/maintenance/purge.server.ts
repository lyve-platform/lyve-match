/**
 * Scheduled account purge. SERVER ONLY.
 *
 * The 30-day retention window is enforced by the database routine
 * `purge_expired_accounts`, which is SECURITY DEFINER, granted to
 * `service_role` only, and additionally refuses to run for any session-bound
 * caller. This module is nothing more than a protected trigger for that
 * routine:
 *
 *   - it takes NO input, so a caller can never choose whose account is purged
 *   - it authenticates with a shared maintenance secret compared in constant
 *     time, and is disabled outright when that secret is absent or too weak
 *   - it is idempotent: the routine only selects deletion requests that are
 *     still `pending` and past their scheduled purge time, and marks them
 *     `completed`, so a second run in the same window does nothing
 *   - it records counts only. No email, name, or profile id is ever logged.
 */
import { timingSafeEqual } from "node:crypto";
import { consumeRate } from "@/lib/billing/store-ops.server";

/** Same shape and posture as the store reconciliation cron limiter. */
export const PURGE_RATE_LIMIT = { limit: 6, windowSeconds: 3600 } as const;

/** A maintenance secret shorter than this is treated as not configured. */
export const PURGE_SECRET_MIN_LENGTH = 16;

export type PurgeResult =
  | { status: 503; body: { ok: false; result: "NOT_CONFIGURED" } }
  | { status: 401; body: { ok: false; result: "UNAUTHORIZED" } }
  | { status: 429; body: { ok: false; result: "RATE_LIMITED" } }
  | { status: 500; body: { ok: false; result: "PURGE_FAILED" } }
  | { status: 200; body: { ok: true; result: "COMPLETED"; purged: number } };

export function purgeSecret(): string | null {
  const value = process.env["ACCOUNT_PURGE_SECRET"];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length >= PURGE_SECRET_MIN_LENGTH ? trimmed : null;
}

function presentedSecret(request: Request): string {
  const header = request.headers.get("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();
  return request.headers.get("x-cron-secret")?.trim() ?? "";
}

/** Constant-time comparison; length mismatch never short-circuits a compare. */
export function secretMatches(presented: string, expected: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export type PurgeRunSummary = { purged: number };

/**
 * Runs the database routine as `service_role`. No arguments come from the
 * request, so the work set is always the database's own expired set.
 */
export async function runAccountPurge(dryRun = false): Promise<PurgeRunSummary> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("purge_expired_accounts", { p_dry_run: dryRun });
  if (error) {
    // Operational only: error code, never a profile id or member detail.
    console.error("[purge] routine failed", { code: error.code });
    throw new Error("PURGE_FAILED");
  }
  return { purged: Array.isArray(data) ? data.length : 0 };
}

export async function handleAccountPurgeRequest(request: Request): Promise<PurgeResult> {
  const expected = purgeSecret();
  // Fail closed: an unconfigured deployment has no purge endpoint at all.
  if (!expected) return { status: 503, body: { ok: false, result: "NOT_CONFIGURED" } };

  if (!secretMatches(presentedSecret(request), expected)) {
    return { status: 401, body: { ok: false, result: "UNAUTHORIZED" } };
  }

  const rate = await consumeRate("cron:account-purge", PURGE_RATE_LIMIT);
  if (!rate.allowed) return { status: 429, body: { ok: false, result: "RATE_LIMITED" } };

  try {
    const summary = await runAccountPurge(false);
    console.log("[purge] completed", { purged: summary.purged });
    return { status: 200, body: { ok: true, result: "COMPLETED", purged: summary.purged } };
  } catch {
    return { status: 500, body: { ok: false, result: "PURGE_FAILED" } };
  }
}
