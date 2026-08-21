import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { isAbortError, newRequestId, recordAbort, ssrLog } from "./lib/ssr-log";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  const requestId = newRequestId();
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }

    // A client that navigates away / cancels mid-render aborts the socket, and
    // so does a dev-server restart. Serve the friendly auto-retrying page
    // rather than a blank document, and alert when aborts come in bursts.
    if (isAbortError(error)) {
      recordAbort({ requestId, source: "request_middleware" });
      return new Response(
        renderErrorPage({ variant: "aborted", requestId, retryAfterSeconds: 3 }),
        {
          status: 503,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "retry-after": "2",
            "cache-control": "no-store",
            "x-request-id": requestId,
          },
        },
      );
    }

    ssrLog("error", { requestId, event: "request_middleware_error" }, error);
    return new Response(renderErrorPage({ variant: "error", requestId }), {
      status: 500,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-request-id": requestId,
      },
    });
  }
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware, csrfMiddleware],
}));
