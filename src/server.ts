import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { isAbortError, newRequestId, recordAbort, ssrLog } from "./lib/ssr-log";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(
  response: Response,
  requestId: string,
): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  const captured = consumeLastCapturedError();

  // A socket abort surfacing as a 500 is the dev-server "blank screen" case:
  // serve the friendly auto-retrying page instead of an empty document.
  if (isAbortError(captured) || /\baborted\b/.test(body)) {
    recordAbort({ requestId, status: 500, source: "h3_swallowed" });
    return abortedResponse(requestId);
  }

  ssrLog("error", { requestId, event: "ssr_unhandled_error", status: 500 }, captured ?? body);
  return errorResponse(requestId);
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true || payload.message === "HTTPError";
  } catch {
    return false;
  }
}

function abortedResponse(requestId: string): Response {
  return new Response(renderErrorPage({ variant: "aborted", requestId, retryAfterSeconds: 3 }), {
    status: 503,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "retry-after": "2",
      "cache-control": "no-store",
      "x-request-id": requestId,
    },
  });
}

function errorResponse(requestId: string): Response {
  return new Response(renderErrorPage({ variant: "error", requestId }), {
    status: 500,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-request-id": requestId,
    },
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const requestId = newRequestId(request);
    const startedAt = Date.now();
    const url = safeUrl(request.url);

    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      const normalized = await normalizeCatastrophicSsrResponse(response, requestId);

      if (normalized.status >= 500) {
        ssrLog("warn", {
          requestId,
          event: "ssr_response_unhealthy",
          method: request.method,
          path: url,
          status: normalized.status,
          durationMs: Date.now() - startedAt,
        });
      }

      if (!normalized.headers.has("x-request-id")) {
        const withId = new Headers(normalized.headers);
        withId.set("x-request-id", requestId);
        return new Response(normalized.body, {
          status: normalized.status,
          statusText: normalized.statusText,
          headers: withId,
        });
      }
      return normalized;
    } catch (error) {
      const aborted = isAbortError(error) || request.signal?.aborted === true;
      if (aborted) {
        recordAbort({
          requestId,
          method: request.method,
          path: url,
          durationMs: Date.now() - startedAt,
          source: "server_entry",
        });
        return abortedResponse(requestId);
      }

      ssrLog(
        "error",
        {
          requestId,
          event: "ssr_request_failed",
          method: request.method,
          path: url,
          durationMs: Date.now() - startedAt,
        },
        error,
      );
      return errorResponse(requestId);
    }
  },
};

function safeUrl(raw: string): string {
  try {
    return new URL(raw).pathname;
  } catch {
    return raw;
  }
}
