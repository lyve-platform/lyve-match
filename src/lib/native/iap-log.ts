/**
 * StoreKit diagnostics log — browser-safe, in-memory only.
 *
 * Purpose: when a purchase or restore does not activate Premium, the member
 * (and support) must be able to see WHY without guessing. The log holds only
 * stable event codes and non-sensitive details: never a receipt/JWS, never a
 * token, never an account identifier. It lives in memory for the session and
 * is never persisted or transmitted automatically.
 */
export type IapLogLevel = "info" | "warn" | "error";

export type IapLogEntry = {
  at: string;
  level: IapLogLevel;
  /** Stable machine code, e.g. `purchase.cancelled`, `link.result`. */
  event: string;
  detail?: Record<string, string | number | boolean | null>;
};

const MAX_ENTRIES = 60;
const entries: IapLogEntry[] = [];
const listeners = new Set<(log: IapLogEntry[]) => void>();

/** Receipts are long opaque blobs; never let one reach the log by accident. */
function safeDetail(detail?: Record<string, unknown>): IapLogEntry["detail"] {
  if (!detail) return undefined;
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(detail)) {
    if (/receipt|jws|token|signature/i.test(key)) continue;
    if (value === null) out[key] = null;
    else if (typeof value === "string") out[key] = value.length > 80 ? `${value.slice(0, 77)}…` : value;
    else if (typeof value === "number" || typeof value === "boolean") out[key] = value;
    else out[key] = String(value).slice(0, 80);
  }
  return out;
}

export function iapLog(
  level: IapLogLevel,
  event: string,
  detail?: Record<string, unknown>,
): void {
  const safe = safeDetail(detail);
  const entry: IapLogEntry = {
    at: new Date().toISOString(),
    level,
    event,
    ...(safe ? { detail: safe } : {}),
  };
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
  if (level === "error") console.error("[iap]", event, entry.detail ?? {});
  else if (level === "warn") console.warn("[iap]", event, entry.detail ?? {});
  else console.info("[iap]", event, entry.detail ?? {});
  for (const listener of listeners) listener([...entries]);
}

export function iapLogEntries(): IapLogEntry[] {
  return [...entries];
}

export function subscribeIapLog(listener: (log: IapLogEntry[]) => void): () => void {
  listeners.add(listener);
  listener([...entries]);
  return () => listeners.delete(listener);
}

/** Human-readable dump the member can copy into a support message. */
export function formatIapLog(log: IapLogEntry[]): string {
  return log
    .map(
      (entry) =>
        `${entry.at} ${entry.level.toUpperCase()} ${entry.event}${
          entry.detail && Object.keys(entry.detail).length
            ? ` ${JSON.stringify(entry.detail)}`
            : ""
        }`,
    )
    .join("\n");
}

/** Last failure, used by the diagnostics panel to explain a missing Premium. */
export function lastIapFailure(log: IapLogEntry[] = entries): IapLogEntry | undefined {
  for (let i = log.length - 1; i >= 0; i -= 1) {
    const entry = log[i]!;
    if (entry.level === "error" || entry.level === "warn") return entry;
  }
  return undefined;
}
