/**
 * Pure decision engine for the martingale trading bot.
 * No network, no secrets, no database — safe to import anywhere and unit-test.
 */
import { roundVolume } from "./mt5-core";

export type BotDirection = "buy" | "sell";

export type BotConfig = {
  enabled: boolean;
  symbol: string;
  direction: BotDirection;
  baseLot: number;
  multiplier: number;
  stepPoints: number;
  maxLegs: number;
  targetUsd: number;
  maxLossUsd: number;
  dailyLossUsd: number;
  minMarginPct: number;
  maxTotalLots: number;
};

export type BotLeg = {
  id: string;
  volume: number;
  openPrice: number;
  profit: number;
};

export type BotTickState = {
  /** Legs currently open on the bot's symbol, oldest first. */
  legs: BotLeg[];
  /** Live price to act on (ask for buys, bid for sells). */
  price: number;
  /** Broker point size, e.g. 0.01 for gold. */
  point: number;
  equity: number;
  margin: number;
  freeMargin: number;
  /** Realised profit/loss already booked today, negative when losing. */
  dayRealizedUsd: number;
};

export type BotAction =
  | { kind: "open_first"; volume: number; reason: string }
  | { kind: "add_leg"; volume: number; reason: string; legIndex: number }
  | { kind: "close_basket"; reason: string; profitUsd: number }
  | { kind: "hold"; reason: string }
  | { kind: "halt"; reason: string };

export function basketVolume(legs: BotLeg[]): number {
  return roundVolume(legs.reduce((sum, l) => sum + l.volume, 0));
}

export function basketProfit(legs: BotLeg[]): number {
  return legs.reduce((sum, l) => sum + l.profit, 0);
}

export function basketAvgPrice(legs: BotLeg[]): number {
  const volume = legs.reduce((sum, l) => sum + l.volume, 0);
  if (volume <= 0) return 0;
  return legs.reduce((sum, l) => sum + l.openPrice * l.volume, 0) / volume;
}

/** Margin level in percent (equity / margin). Infinite when nothing is open. */
export function marginLevelPct(equity: number, margin: number): number {
  if (margin <= 0) return Number.POSITIVE_INFINITY;
  return (equity / margin) * 100;
}

export function legVolume(config: BotConfig, index: number): number {
  return roundVolume(config.baseLot * Math.pow(config.multiplier, index));
}

/**
 * Decide what the bot should do on this tick. Deterministic and side-effect free.
 */
export function decide(state: BotTickState, config: BotConfig): BotAction {
  if (!config.enabled) return { kind: "hold", reason: "bot_disabled" };

  const legs = state.legs;
  const openCount = legs.length;
  const profit = basketProfit(legs);
  const volume = basketVolume(legs);

  // 1. Take profit on the whole basket first — this is how the strategy exits.
  if (openCount > 0 && profit >= config.targetUsd) {
    return { kind: "close_basket", reason: "target_reached", profitUsd: profit };
  }

  // 2. Hard loss stop for the basket.
  if (openCount > 0 && profit <= -Math.abs(config.maxLossUsd)) {
    return { kind: "halt", reason: "basket_max_loss" };
  }

  // 3. Daily loss limit (already-realised losses).
  if (state.dayRealizedUsd <= -Math.abs(config.dailyLossUsd)) {
    return { kind: "halt", reason: "daily_loss_limit" };
  }

  // 4. Margin safety.
  const level = marginLevelPct(state.equity, state.margin);
  if (openCount > 0 && level < config.minMarginPct) {
    return { kind: "halt", reason: "margin_too_low" };
  }

  // 5. No basket yet → open the first leg.
  if (openCount === 0) {
    if (state.price <= 0) return { kind: "hold", reason: "no_price" };
    return { kind: "open_first", volume: legVolume(config, 0), reason: "new_basket" };
  }

  // 6. Basket open → maybe add the next martingale leg.
  if (openCount >= config.maxLegs) {
    return { kind: "hold", reason: "max_legs_reached" };
  }

  const nextVolume = legVolume(config, openCount);
  if (roundVolume(volume + nextVolume) > config.maxTotalLots) {
    return { kind: "hold", reason: "max_total_lots" };
  }

  const lastLeg = legs[legs.length - 1];
  if (!lastLeg) return { kind: "hold", reason: "no_legs" };
  const step = config.stepPoints * state.point;
  const moved =
    config.direction === "buy"
      ? lastLeg.openPrice - state.price
      : state.price - lastLeg.openPrice;

  if (moved >= step) {
    return {
      kind: "add_leg",
      volume: nextVolume,
      legIndex: openCount,
      reason: "step_reached",
    };
  }

  return { kind: "hold", reason: "waiting_for_step" };
}
