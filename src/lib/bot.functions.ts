/**
 * Authenticated RPC surface for the trading bot.
 * Every call is scoped to the caller's own bot config, basket and log.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type BotSettings = {
  enabled: boolean;
  symbol: string;
  direction: "buy" | "sell";
  baseLot: number;
  multiplier: number;
  stepPoints: number;
  maxLegs: number;
  targetUsd: number;
  maxLossUsd: number;
  dailyLossUsd: number;
  minMarginPct: number;
  maxTotalLots: number;
  disabledReason: string | null;
  lastTickAt: string | null;
  dayRealizedUsd: number;
};

export type BotRun = {
  id: string;
  action: string;
  detail: Record<string, unknown>;
  createdAt: string;
};

export type BotState = {
  settings: BotSettings;
  runs: BotRun[];
};

const DEFAULTS: BotSettings = {
  enabled: false,
  symbol: "XAUUSD",
  direction: "buy",
  baseLot: 0.01,
  multiplier: 2,
  stepPoints: 300,
  maxLegs: 6,
  targetUsd: 5,
  maxLossUsd: 200,
  dailyLossUsd: 300,
  minMarginPct: 200,
  maxTotalLots: 1,
  disabledReason: null,
  lastTickAt: null,
  dayRealizedUsd: 0,
};

type Row = Record<string, unknown>;

function toSettings(row: Row | null): BotSettings {
  if (!row) return DEFAULTS;
  return {
    enabled: Boolean(row["enabled"]),
    symbol: String(row["symbol"] ?? "XAUUSD"),
    direction: row["direction"] === "sell" ? "sell" : "buy",
    baseLot: Number(row["base_lot"] ?? 0.01),
    multiplier: Number(row["multiplier"] ?? 2),
    stepPoints: Number(row["step_points"] ?? 300),
    maxLegs: Number(row["max_legs"] ?? 6),
    targetUsd: Number(row["target_usd"] ?? 5),
    maxLossUsd: Number(row["max_loss_usd"] ?? 200),
    dailyLossUsd: Number(row["daily_loss_usd"] ?? 300),
    minMarginPct: Number(row["min_margin_pct"] ?? 200),
    maxTotalLots: Number(row["max_total_lots"] ?? 1),
    disabledReason: (row["disabled_reason"] as string | null) ?? null,
    lastTickAt: (row["last_tick_at"] as string | null) ?? null,
    dayRealizedUsd: Number(row["day_realized_usd"] ?? 0),
  };
}

type Db = { from: (table: string) => any };

async function loadState(supabase: Db, userId: string): Promise<BotState> {
  const [{ data: config }, { data: runs }] = await Promise.all([
    supabase.from("bot_configs").select("*").eq("user_id", userId).maybeSingle(),
    supabase
      .from("bot_runs")
      .select("id, action, detail, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(40),
  ]);

  return {
    settings: toSettings((config as Row | null) ?? null),
    runs: ((runs as Row[] | null) ?? []).map((r) => ({
      id: String(r["id"]),
      action: String(r["action"]),
      detail: (r["detail"] as Record<string, unknown>) ?? {},
      createdAt: String(r["created_at"]),
    })),
  };
}

export const getBotState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BotState> =>
    loadState(context.supabase as never as Db, context.userId as string),
  );

const settingsSchema = z.object({
  symbol: z.string().trim().min(1).max(24),
  direction: z.enum(["buy", "sell"]),
  baseLot: z.number().positive().max(10),
  multiplier: z.number().min(1).max(4),
  stepPoints: z.number().positive().max(100000),
  maxLegs: z.number().int().min(1).max(12),
  targetUsd: z.number().positive().max(100000),
  maxLossUsd: z.number().positive().max(1000000),
  dailyLossUsd: z.number().positive().max(1000000),
  minMarginPct: z.number().min(0).max(10000),
  maxTotalLots: z.number().positive().max(200),
});

export const saveBotConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => settingsSchema.parse(input))
  .handler(async ({ data, context }): Promise<BotState> => {
    const supabase = context.supabase as never as Db;
    const { error } = await supabase.from("bot_configs").upsert(
      {
        user_id: context.userId,
        symbol: data.symbol,
        direction: data.direction,
        base_lot: data.baseLot,
        multiplier: data.multiplier,
        step_points: data.stepPoints,
        max_legs: data.maxLegs,
        target_usd: data.targetUsd,
        max_loss_usd: data.maxLossUsd,
        daily_loss_usd: data.dailyLossUsd,
        min_margin_pct: data.minMarginPct,
        max_total_lots: data.maxTotalLots,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error("bot_save_failed");
    return loadState(supabase, context.userId as string);
  });

export const toggleBot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ enabled: z.boolean() }).parse(input))
  .handler(async ({ data, context }): Promise<BotState> => {
    const supabase = context.supabase as never as Db;
    if (data.enabled) {
      const { data: linked } = await supabase
        .from("mt5_accounts")
        .select("id")
        .eq("user_id", context.userId)
        .maybeSingle();
      if (!linked) throw new Error("mt5_not_linked");
    }
    const { error } = await supabase.from("bot_configs").upsert(
      {
        user_id: context.userId,
        enabled: data.enabled,
        disabled_reason: data.enabled ? null : "stopped_by_user",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error("bot_toggle_failed");
    await supabase.from("bot_runs").insert({
      user_id: context.userId,
      action: data.enabled ? "started" : "stopped",
      detail: {},
    });
    return loadState(supabase, context.userId as string);
  });

/** Kill switch: stop the bot and flatten every position on its symbol. */
export const panicStop = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ closed: number }> => {
    const supabase = context.supabase as never as Db;
    const { data: config } = await supabase
      .from("bot_configs")
      .select("symbol")
      .eq("user_id", context.userId)
      .maybeSingle();
    const symbol = (config?.symbol as string | undefined) ?? "XAUUSD";

    await supabase
      .from("bot_configs")
      .upsert(
        {
          user_id: context.userId,
          enabled: false,
          disabled_reason: "panic_stop",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

    let closed = 0;
    const { data: linked } = await supabase
      .from("mt5_accounts")
      .select("provider_account_id")
      .eq("user_id", context.userId)
      .maybeSingle();

    if (linked?.provider_account_id && process.env["METAAPI_TOKEN"]) {
      const mt5 = await import("./mt5.server");
      const accountId = linked.provider_account_id as string;
      const open = await mt5.positions(accountId).catch(() => []);
      for (const position of open.filter((p) => p.symbol === symbol)) {
        const done = await mt5.closePosition(accountId, position.id).catch(() => null);
        if (done) closed += 1;
      }
    }

    await supabase
      .from("bot_baskets")
      .update({ closed_at: new Date().toISOString() })
      .eq("user_id", context.userId)
      .is("closed_at", null);
    await supabase
      .from("bot_runs")
      .insert({ user_id: context.userId, action: "panic_stop", detail: { closed } });

    return { closed };
  });

/** Run one bot tick for the caller right now (manual "run once"). */
export const runBotNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ action: string; reason: string }> => {
    const supabase = context.supabase as never as Db;
    const { data: config } = await supabase
      .from("bot_configs")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!config) return { action: "skipped", reason: "no_config" };
    const { tickUser } = await import("./bot.server");
    const result = await tickUser({ ...(config as never), enabled: true });
    return { action: result.action, reason: result.reason };
  });
