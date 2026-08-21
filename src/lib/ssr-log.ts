// Structured SSR logging: every request gets an id so a blank screen in the
// browser can be traced to one server log line.

import { describeError } from "./error-capture";

export type SsrLogLevel = "info" | "warn" | "alert" | "error";

export type SsrLogFields = {
  requestId: string;
  event: string;
  method?: string;
  path?: string;
  status?: number;
  durationMs?: number;
  [key: string]: unknown;
};

export function newRequestId(request?: Request): string {
  const header =
    request?.headers.get("x-request-id") ??
    request?.headers.get("cf-ray") ??
    request?.headers.get("x-correlation-id");
  if (header) return header.slice(0, 64);
  try {
    return crypto.randomUUID();
  } catch {
    return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function ssrLog(level: SsrLogLevel, fields: SsrLogFields, error?: unknown): void {
  const payload = {
    ts: new Date().toISOString(),
    level,
    scope: "ssr",
    ...fields,
    ...(error === undefined ? {} : { error: describeError(error) }),
  };

  const line = `[ssr:${level}] ${safeJson(payload)}`;
  if (level === "error" || level === "alert") {
    // console.error keeps the stack in the log pipeline and triggers alerting.
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

/**
 * Aborted requests are not application errors, but a burst of them means the
 * server is dropping work mid-render (restart, dependency re-optimization,
 * proxy timeout) — which is exactly what shows up as a blank screen. Log the
 * first ones at alert level and rate-limit the rest.
 */
const ABORT_WINDOW_MS = 30_000;
const ABORT_ALERT_THRESHOLD = 3;
let abortWindowStart = 0;
let abortCount = 0;

export function recordAbort(fields: Omit<SsrLogFields, "event">): void {
  const now = Date.now();
  if (now - abortWindowStart > ABORT_WINDOW_MS) {
    abortWindowStart = now;
    abortCount = 0;
  }
  abortCount += 1;

  const burst = abortCount >= ABORT_ALERT_THRESHOLD;
  ssrLog(burst ? "alert" : "warn", {
    ...fields,
    event: burst ? "ssr_request_aborted_burst" : "ssr_request_aborted",
    abortsInWindow: abortCount,
    windowMs: ABORT_WINDOW_MS,
  });
}

export function isAbortError(error: unknown): boolean {
  if (error == null) return false;
  if (typeof error === "string") return error.toLowerCase().includes("aborted");
  if (typeof error !== "object") return false;
  const err = error as { name?: string; message?: string; code?: string; cause?: unknown };
  if (
    err.name === "AbortError" ||
    err.name === "TimeoutError" ||
    err.message === "aborted" ||
    err.message === "The operation was aborted." ||
    err.code === "ECONNRESET" ||
    err.code === "ABORT_ERR" ||
    err.code === "ERR_STREAM_PREMATURE_CLOSE"
  ) {
    return true;
  }
  return err.cause != null && err.cause !== error ? isAbortError(err.cause) : false;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
