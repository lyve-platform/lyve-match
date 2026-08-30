/**
 * Trading bot runner (server-only).
 *
 * One "tick" per user: read the saved config, pull live account state from the
 * broker bridge, run the pure decision engine, then execute at most one action.
 * Every tick is written to bot_runs so the user can audit the bot.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  basketAvgPrice,
  basketProfit,
  basketVolume,
  decide,
  type BotAction,
  type BotConfig,
  type BotLeg,
} from "./bot-core";
import * as mt5 from "./mt5.server";

export type BotConfigRow = {
  user_id: string;
  enabled: boolean;
  symbol: string;
  direction: string;
  base_lot: number;
  multiplier: number;
  step_points: number;
  max_legs: number;
  target_usd: number;
  max_loss_usd: number;
  daily_loss_usd: number;
  min_margin_pct: number;
  max_total_lots: number;
  disabled_reason: string | null;
  day_key: string | null;
  day_realized_usd: number;
};

export function toConfig(row: BotConfigRow): BotConfig {
  return {
    enabled: row.enabled,
    symbol: row.symbol,
    direction: row.direction === "sell" ? "sell" : "buy",
    baseLot: Number(row.base_lot),
    multiplier: Number(row.multiplier),
    stepPoints: Number(row.step_points),
    maxLegs: Number(row.max_legs),
    targetUsd: Number(row.target_usd),
    maxLossUsd: Number(row.max_loss_usd),
    dailyLossUsd: Number(row.daily_loss_usd),
    minMarginPct: Number(row.min_margin_pct),
    maxTotalLots: Number(row.max_total_lots),
  };
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function log(
  userId: string,
  action: string,
  detail: Record<string, unknown> = {},
): Promise<void> {
  await supabaseAdmin
    .from("bot_runs")
    .insert({ user_id: userId, action, detail: detail as never })
    .then(
      () => undefined,
      () => undefined,
    );
}

async function providerAccountId(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("mt5_accounts")
    .select("provider_account_id")
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.provider_account_id as string | undefined) ?? null;
}

export async function disableBot(userId: string, reason: string): Promise<void> {
  await supabaseAdmin
    .from("bot_configs")
    .update({ enabled: false, disabled_reason: reason, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  await log(userId, "halt", { reason });
}

export type TickResult = {
  userId: string;
  action: BotAction["kind"] | "skipped";
  reason: string;
};

export async function tickUser(row: BotConfigRow): Promise<TickResult> {
  const userId = row.user_id;
  const config = toConfig(row);

  if (!process.env["METAAPI_TOKEN"]) {
    return { userId, action: "skipped", reason: "mt5_not_configured" };
  }
  const accountId = await providerAccountId(userId);
  if (!accountId) {
    await disableBot(userId, "account_not_linked");
    return { userId, action: "halt", reason: "account_not_linked" };
  }

  // Reset the daily counter when the date rolls over.
  const key = todayKey();
  let dayRealized = Number(row.day_realized_usd) || 0;
  if (row.day_key !== key) {
    dayRealized = 0;
    await supabaseAdmin
      .from("bot_configs")
      .update({ day_key: key, day_realized_usd: 0 })
      .eq("user_id", userId);
  }

  let account: mt5.AccountInformation;
  let price: mt5.SymbolPrice;
  let spec: mt5.SymbolSpecification;
  let open: mt5.Position[];
  try {
    [account, price, spec, open] = await Promise.all([
      mt5.accountInformation(accountId),
      mt5.symbolPrice(accountId, config.symbol),
      mt5.symbolSpecification(accountId, config.symbol),
      mt5.positions(accountId),
    ]);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "broker_unavailable";
    await log(userId, "error", { reason: reason.slice(0, 200) });
    return { userId, action: "skipped", reason: "broker_unavailable" };
  }

  const wanted = config.direction === "buy" ? "POSITION_TYPE_BUY" : "POSITION_TYPE_SELL";
  const legs: BotLeg[] = open
    .filter((p) => p.symbol === config.symbol && p.type === wanted)
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
    .map((p) => ({
      id: p.id,
      volume: p.volume,
      openPrice: p.openPrice,
      profit: p.profit + (p.swap || 0),
    }));

  const livePrice = config.direction === "buy" ? price.ask : price.bid;
  const action = decide(
    {
      legs,
      price: livePrice,
      point: spec.point ?? 0.01,
      equity: account.equity,
      margin: account.margin,
      freeMargin: account.freeMargin,
      dayRealizedUsd: dayRealized,
    },
    config,
  );

  await supabaseAdmin
    .from("bot_configs")
    .update({ last_tick_at: new Date().toISOString() })
    .eq("user_id", userId);

  switch (action.kind) {
    case "open_first":
    case "add_leg": {
      const volume = Math.max(spec.minVolume ?? 0.01, action.volume);
      const result = await mt5.marketOrder(accountId, {
        side: config.direction,
        symbol: config.symbol,
        volume,
        comment: `lyvebot-${action.kind === "open_first" ? 0 : action.legIndex}`,
      });
      await log(userId, action.kind, {
        volume,
        price: livePrice,
        code: result.stringCode ?? null,
        message: result.message ?? null,
      });
      if (action.kind === "open_first") {
        await supabaseAdmin.from("bot_baskets").insert({
          user_id: userId,
          symbol: config.symbol,
          direction: config.direction,
          legs_filled: 1,
          last_entry_price: livePrice,
          avg_price: livePrice,
          total_volume: volume,
        });
      } else {
        const { data: basket } = await supabaseAdmin
          .from("bot_baskets")
          .select("id")
          .eq("user_id", userId)
          .is("closed_at", null)
          .order("opened_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (basket?.id) {
          await supabaseAdmin
            .from("bot_baskets")
            .update({
              legs_filled: legs.length + 1,
              last_entry_price: livePrice,
              avg_price: basketAvgPrice([
                ...legs,
                { id: "new", volume, openPrice: livePrice, profit: 0 },
              ]),
              total_volume: basketVolume([
                ...legs,
                { id: "new", volume, openPrice: livePrice, profit: 0 },
              ]),
            })
            .eq("id", basket.id);
        }
      }
      return { userId, action: action.kind, reason: action.reason };
    }

    case "close_basket": {
      let closed = 0;
      for (const leg of legs) {
        const res = await mt5.closePosition(accountId, leg.id).catch(() => null);
        if (res) closed += 1;
      }
      const realized = basketProfit(legs);
      await supabaseAdmin
        .from("bot_configs")
        .update({ day_key: key, day_realized_usd: dayRealized + realized })
        .eq("user_id", userId);
      await supabaseAdmin
        .from("bot_baskets")
        .update({ closed_at: new Date().toISOString(), realized_usd: realized })
        .eq("user_id", userId)
        .is("closed_at", null);
      await log(userId, "close_basket", { closed, realizedUsd: realized });
      return { userId, action: "close_basket", reason: action.reason };
    }

    case "halt": {
      // Losing basket / margin / daily limit: flatten and switch the bot off.
      if (action.reason !== "daily_loss_limit" || legs.length > 0) {
        for (const leg of legs) {
          await mt5.closePosition(accountId, leg.id).catch(() => undefined);
        }
      }
      const realized = basketProfit(legs);
      await supabaseAdmin
        .from("bot_baskets")
        .update({ closed_at: new Date().toISOString(), realized_usd: realized })
        .eq("user_id", userId)
        .is("closed_at", null);
      await supabaseAdmin
        .from("bot_configs")
        .update({
          enabled: false,
          disabled_reason: action.reason,
          day_key: key,
          day_realized_usd: dayRealized + realized,
        })
        .eq("user_id", userId);
      await log(userId, "halt", { reason: action.reason, realizedUsd: realized });
      return { userId, action: "halt", reason: action.reason };
    }

    default:
      return { userId, action: "hold", reason: action.reason };
  }
}

export async function runAllBots(): Promise<{ ticked: number; results: TickResult[] }> {
  const { data } = await supabaseAdmin
    .from("bot_configs")
    .select("*")
    .eq("enabled", true)
    .limit(200);

  const rows = (data ?? []) as unknown as BotConfigRow[];
  const results: TickResult[] = [];
  for (const row of rows) {
    try {
      results.push(await tickUser(row));
    } catch (err) {
      const reason = err instanceof Error ? err.message : "tick_failed";
      await log(row.user_id, "error", { reason: reason.slice(0, 200) });
      results.push({ userId: row.user_id, action: "skipped", reason: "tick_failed" });
    }
  }
  return { ticked: results.length, results };
}
