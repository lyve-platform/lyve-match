/**
 * Store operations: rate limiting, alerting, safe fingerprints. SERVER ONLY.
 *
 * Design rules:
 *   - Nothing here ever stores a receipt, purchase token, OIDC token or store
 *     payload. Purchase references are recorded as a truncated SHA-256 digest,
 *     which is enough to correlate incidents and useless to an attacker.
 *   - The rate limiter is a database fixed window, so it holds across every
 *     server instance instead of per-process memory.
 *   - Failing to record an alert must never break or bypass request handling:
 *     monitoring degrades, the security decision does not.
 */
import { createHash } from "node:crypto";

export type AlertSeverity = "info" | "warning" | "critical";

export type StoreAlertKind =
  | "store_signature_failure"
  | "store_rate_limited"
  | "store_link_rejected"
  | "store_processing_failure"
  | "store_reconciliation_drift"
  | "store_reconciliation_failure"
  | "store_misconfiguration";

/** Thresholds are per fingerprint per window; below them we only count. */
const ALERT_POLICY: Record<StoreAlertKind, { severity: AlertSeverity; windowSeconds: number; threshold: number }> = {
  store_signature_failure: { severity: "critical", windowSeconds: 300, threshold: 5 },
  store_rate_limited: { severity: "warning", windowSeconds: 300, threshold: 3 },
  store_link_rejected: { severity: "warning", windowSeconds: 900, threshold: 5 },
  store_processing_failure: { severity: "critical", windowSeconds: 300, threshold: 1 },
  store_reconciliation_drift: { severity: "warning", windowSeconds: 3600, threshold: 1 },
  store_reconciliation_failure: { severity: "critical", windowSeconds: 3600, threshold: 1 },
  store_misconfiguration: { severity: "critical", windowSeconds: 3600, threshold: 1 },
};

/** Rate limits, per fixed window. Webhooks are the hostile surface. */
export const RATE_LIMITS = {
  webhook: { limit: 120, windowSeconds: 60 },
  webhookFailure: { limit: 20, windowSeconds: 300 },
  link: { limit: 10, windowSeconds: 600 },
  reconcile: { limit: 4, windowSeconds: 3600 },
} as const;

/** Short, non-reversible correlation handle for a purchase ref or token. */
export function refDigest(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export type RateDecision = { allowed: boolean; hits: number };

export async function consumeRate(
  bucket: string,
  policy: { limit: number; windowSeconds: number },
): Promise<RateDecision> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("store_rate_limit_hit", {
      p_bucket: bucket.slice(0, 200),
      p_limit: policy.limit,
      p_window_seconds: policy.windowSeconds,
    });
    if (error) {
      console.error("[store] rate limiter unavailable", { code: error.code });
      // Fail closed on the hostile surface: no limiter, no traffic.
      return { allowed: false, hits: 0 };
    }
    const result = (data ?? {}) as { allowed?: boolean; hits?: number };
    return { allowed: result.allowed === true, hits: Number(result.hits ?? 0) };
  } catch {
    return { allowed: false, hits: 0 };
  }
}

export type AlertOutcome = { recorded: boolean; occurrences: number; breached: boolean };

export async function raiseStoreAlert(
  kind: StoreAlertKind,
  fingerprint: string,
  details: Record<string, unknown> = {},
): Promise<AlertOutcome> {
  const policy = ALERT_POLICY[kind];
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("store_raise_alert", {
      p_kind: kind,
      p_severity: policy.severity,
      p_fingerprint: fingerprint.slice(0, 200),
      p_details: sanitizeDetails(details) as never,
      p_window_seconds: policy.windowSeconds,
      p_threshold: policy.threshold,
    });
    if (error) {
      console.error("[store] alert sink unavailable", { kind });
      return { recorded: false, occurrences: 0, breached: false };
    }
    const result = (data ?? {}) as { occurrences?: number; breached?: boolean };
    const outcome = {
      recorded: true,
      occurrences: Number(result.occurrences ?? 0),
      breached: result.breached === true,
    };
    if (outcome.breached) {
      // Alert transport (paging/email) is attached here once operations
      // choose one; the durable record is the source of truth either way.
      console.warn("[store][ALERT]", { kind, severity: policy.severity, occurrences: outcome.occurrences });
    }
    return outcome;
  } catch {
    return { recorded: false, occurrences: 0, breached: false };
  }
}

const ALLOWED_DETAIL_KEYS = new Set([
  "store",
  "environment",
  "reason",
  "result",
  "status",
  "ref_digest",
  "event_id",
  "plan_code",
  "rail",
  "hits",
  "scanned",
  "corrected",
  "failed",
]);

/** Whitelist: an operational field can never smuggle a store token into logs. */
export function sanitizeDetails(details: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (!ALLOWED_DETAIL_KEYS.has(key)) continue;
    if (typeof value === "string") out[key] = value.slice(0, 120);
    else if (typeof value === "number" || typeof value === "boolean" || value === null) out[key] = value;
  }
  return out;
}
