/**
 * Provider-facing billing webhook.
 *
 * Lives under /api/public so provider traffic is not subject to member
 * authentication — the signature IS the authentication. Everything else is
 * delegated to the server-only processor, which fails closed.
 */
import { createFileRoute } from "@tanstack/react-router";

const JSON_HEADERS = { "content-type": "application/json", "cache-control": "no-store" };

export const Route = createFileRoute("/api/public/webhooks/billing")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const { handleBillingWebhook } = await import("@/lib/billing/webhook.server");
        const outcome = await handleBillingWebhook(rawBody, request.headers);
        return new Response(JSON.stringify(outcome.body), {
          status: outcome.status,
          headers: JSON_HEADERS,
        });
      },
      GET: async () =>
        new Response(JSON.stringify({ received: false, result: "METHOD_NOT_ALLOWED" }), {
          status: 405,
          headers: JSON_HEADERS,
        }),
    },
  },
});
