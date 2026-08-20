import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

// A client that navigates away / cancels mid-render aborts the socket. That is
// not an application error: don't log it and don't render the error page.
const isAbortError = (error: unknown) => {
  if (error == null || typeof error !== "object") return false;
  const err = error as { name?: string; message?: string; code?: string };
  return (
    err.name === "AbortError" ||
    err.message === "aborted" ||
    err.code === "ECONNRESET" ||
    err.code === "ABORT_ERR"
  );
};

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    if (isAbortError(error)) {
      return new Response(null, { status: 499 });
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
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
