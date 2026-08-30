/**
 * Scheduled trading-bot tick.
 *
 * Public prefix, but not public: the caller must present the shared cron
 * secret in a bearer header, compared in constant time. Without the secret
 * configured the endpoint is disabled rather than open. It takes no input —
 * the work set is every bot our own database has marked as enabled.
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

export const Route = createFileRoute("/api/public/cron/bot-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const presented = presentedSecret(request) ?? "";
        if (presented.length < 16) return json(401, { ok: false, result: "UNAUTHORIZED" });

        // Accept either the environment secret or the database-held scheduler
        // token (used by the in-database scheduler, which cannot read env).
        const candidates: string[] = [];
        const envSecret = process.env["BOT_CRON_SECRET"];
        if (envSecret && envSecret.length >= 16) candidates.push(envSecret);
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data } = await supabaseAdmin
            .from("bot_cron_secret")
            .select("token")
            .limit(1)
            .maybeSingle();
          const token = (data?.token as string | undefined) ?? "";
          if (token.length >= 16) candidates.push(token);
        } catch {
          /* database token unavailable — fall back to env only */
        }
        if (candidates.length === 0) return json(503, { ok: false, result: "NOT_CONFIGURED" });

        const a = Buffer.from(presented);
        const matches = candidates.some((candidate) => {
          const b = Buffer.from(candidate);
          return a.length === b.length && timingSafeEqual(a, b);
        });
        if (!matches) return json(401, { ok: false, result: "UNAUTHORIZED" });


        if (!process.env["METAAPI_TOKEN"]) {
          return json(503, { ok: false, result: "BROKER_NOT_CONFIGURED" });
        }

        try {
          const { runAllBots } = await import("@/lib/bot.server");
          const { ticked, results } = await runAllBots();
          return json(200, { ok: true, ticked, results });
        } catch (err) {
          const message = err instanceof Error ? err.message : "tick_failed";
          return json(500, { ok: false, result: message.slice(0, 200) });
        }
      },
    },
  },
});
