/**
 * Google Play Real-Time Developer Notifications endpoint.
 *
 * Public by necessity — the signature IS the authentication. No production
 * Google Play credentials are connected in this phase, so the verifier fails
 * closed.
 */
import { createFileRoute } from "@tanstack/react-router";

const JSON_HEADERS = { "content-type": "application/json", "cache-control": "no-store" };

export const Route = createFileRoute("/api/public/webhooks/google")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const { handleStoreNotification } = await import("@/lib/billing/store-webhook.server");
        const outcome = await handleStoreNotification("google", rawBody, request.headers);
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
