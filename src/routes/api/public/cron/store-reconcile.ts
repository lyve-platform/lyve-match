/**
 * Scheduled store reconciliation endpoint.
 *
 * Public prefix, but NOT public: the caller must present the shared cron
 * secret in a bearer header, compared in constant time. Without the secret
 * configured the endpoint is disabled rather than open. It takes no input at
 * all — the work set comes from our own database, so a caller can never point
 * reconciliation at a purchase of their choosing.
 */
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";

const JSON_HEADERS = { "content-type": "application/json", "cache-control": "no-store" };

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function presentedSecret(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();
  return request.headers.get("x-cron-secret");
}

export const Route = createFileRoute("/api/public/cron/store-reconcile")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["STORE_RECONCILE_SECRET"];
        if (!expected || expected.length < 16) return json(503, { ok: false, result: "NOT_CONFIGURED" });

        const presented = presentedSecret(request) ?? "";
        const a = Buffer.from(presented);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return json(401, { ok: false, result: "UNAUTHORIZED" });
        }

        const { consumeRate, RATE_LIMITS } = await import("@/lib/billing/store-ops.server");
        const rate = await consumeRate("cron:store-reconcile", RATE_LIMITS.reconcile);
        if (!rate.allowed) return json(429, { ok: false, result: "RATE_LIMITED" });

        const { reconcileStorePurchases } = await import("@/lib/billing/store-reconcile.server");
        const summary = await reconcileStorePurchases({ mode: "scheduled" });
        return json(200, { ok: true, result: "COMPLETED", summary });
      },
      GET: async () => json(405, { ok: false, result: "METHOD_NOT_ALLOWED" }),
    },
  },
});
