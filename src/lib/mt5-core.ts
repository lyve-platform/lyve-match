/**
 * Pure, browser-safe math for the martingale grid assistant.
 * No network, no secrets — safe to import from components and tests.
 */

export type GridLeg = {
  index: number;
  price: number;
  volume: number;
};

export type GridPlan = {
  legs: GridLeg[];
  totalVolume: number;
  breakEven: number;
  worstCaseLossUsd: number;
  targetPrice: number;
  targetProfitUsd: number;
};

export type GridInput = {
  side: "buy" | "sell";
  entryPrice: number;
  baseVolume: number;
  multiplier: number;
  stepPoints: number;
  legs: number;
  takeProfitPoints: number;
  /** Contract value per 1 lot per 1.0 price unit (gold: 100 oz). */
  contractSize: number;
  /** Price movement of one "point" as shown by the broker. */
  pointValue: number;
};

export function roundVolume(volume: number): number {
  return Math.round(volume * 100) / 100;
}

export function buildGrid(input: GridInput): GridPlan {
  const {
    side,
    entryPrice,
    baseVolume,
    multiplier,
    stepPoints,
    legs,
    takeProfitPoints,
    contractSize,
    pointValue,
  } = input;

  const dir = side === "buy" ? 1 : -1;
  const step = stepPoints * pointValue;
  const count = Math.max(1, Math.min(12, Math.floor(legs)));

  const built: GridLeg[] = [];
  for (let i = 0; i < count; i += 1) {
    built.push({
      index: i,
      price: entryPrice - dir * step * i,
      volume: roundVolume(baseVolume * Math.pow(multiplier, i)),
    });
  }

  const totalVolume = roundVolume(built.reduce((sum, leg) => sum + leg.volume, 0));
  const weighted = built.reduce((sum, leg) => sum + leg.price * leg.volume, 0);
  const breakEven = totalVolume > 0 ? weighted / totalVolume : entryPrice;

  const lastPrice = built[built.length - 1]?.price ?? entryPrice;
  const worstCaseLossUsd = built.reduce(
    (sum, leg) => sum + Math.abs(leg.price - lastPrice) * leg.volume * contractSize,
    0,
  );

  const targetPrice = breakEven + dir * takeProfitPoints * pointValue;
  const targetProfitUsd =
    Math.abs(targetPrice - breakEven) * totalVolume * contractSize;

  return {
    legs: built,
    totalVolume,
    breakEven,
    worstCaseLossUsd,
    targetPrice,
    targetProfitUsd,
  };
}

/** Which grid leg should fire next, given the live price and open volume. */
export function nextLegIndex(plan: GridPlan, filled: number): GridLeg | null {
  return plan.legs[filled] ?? null;
}

export function shouldFireLeg(
  side: "buy" | "sell",
  leg: GridLeg,
  currentPrice: number,
): boolean {
  return side === "buy" ? currentPrice <= leg.price : currentPrice >= leg.price;
}

export function formatMoney(value: number, digits = 2): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
