/**
 * Scheduled 30-day account purge endpoint.
 *
 * Public prefix, but NOT public: the caller must present the maintenance
 * secret, compared in constant time. Without the secret configured the
 * endpoint is disabled rather than open. It accepts no input — the work set
 * comes from our own database, so a caller can never point the purge at an
 * account of their choosing.
 */
import { createFileRoute } from "@tanstack/react-router";

const JSON_HEADERS = { "content-type": "application/json", "cache-control": "no-store" };

export const Route = createFileRoute("/api/public/cron/account-purge")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleAccountPurgeRequest } = await import("@/lib/maintenance/purge.server");
        const outcome = await handleAccountPurgeRequest(request);
        return new Response(JSON.stringify(outcome.body), {
          status: outcome.status,
          headers: JSON_HEADERS,
        });
      },
      GET: async () =>
        new Response(JSON.stringify({ ok: false, result: "METHOD_NOT_ALLOWED" }), {
          status: 405,
          headers: JSON_HEADERS,
        }),
    },
  },
});
