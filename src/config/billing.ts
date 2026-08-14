/**
 * LYVE billing configuration.
 *
 * This is the ONLY place where plans, intervals, currencies and the
 * entitlement catalogue are declared. Nothing here grants access — it is
 * presentation and mapping metadata. Access always comes from the database.
 *
 * Stage: ARCHITECTURE. No payment provider is connected, no production
 * credentials exist, and no price is real. `amountMinor: null` means
 * "not announced yet" and the UI must say so rather than invent a number.
 */

export const BILLING_STAGE = "architecture" as const;

/**
 * Which provider adapter the server should use. `none` = checkout disabled.
 * The active value is resolved SERVER-SIDE only (see `src/lib/billing/resolver.ts`);
 * the browser learns it from the billing snapshot, never from an env read.
 */
export const DEFAULT_BILLING_PROVIDER = "none" as const;

export const BILLING_PROVIDERS = ["none", "mock", "stripe", "paddle", "apple", "google", "manual"] as const;
export type BillingProviderId = (typeof BILLING_PROVIDERS)[number];


export const ENTITLEMENT_KEYS = [
  "premium",
  "who_liked_me",
  "advanced_preferences",
  "compatibility_insights",
  "rewind",
  "unlimited_likes",
] as const;
export type EntitlementKey = (typeof ENTITLEMENT_KEYS)[number];

export function isEntitlementKey(value: unknown): value is EntitlementKey {
  return typeof value === "string" && (ENTITLEMENT_KEYS as readonly string[]).includes(value);
}

/** Everything a Premium subscription unlocks. Keep in sync with the paywall. */
export const PREMIUM_ENTITLEMENTS: EntitlementKey[] = [
  "premium",
  "who_liked_me",
  "advanced_preferences",
  "compatibility_insights",
  "rewind",
  "unlimited_likes",
];

/** Free vs Premium feature matrix, rendered on /premium. */
export const FEATURE_MATRIX: Array<{ id: string; free: boolean; premium: boolean }> = [
  { id: "profile", free: true, premium: true },
  { id: "discovery", free: true, premium: true },
  { id: "likePass", free: true, premium: true },
  { id: "matching", free: true, premium: true },
  { id: "messaging", free: true, premium: true },
  { id: "basicCompatibility", free: true, premium: true },
  { id: "safety", free: true, premium: true },
  { id: "whoLikedMe", free: false, premium: true },
  { id: "advancedPreferences", free: false, premium: true },
  { id: "compatibilityInsights", free: false, premium: true },
  { id: "rewind", free: false, premium: true },
];

export type BillingIntervalId = "month" | "year";

export type PlanPrice = {
  currency: string;
  interval: BillingIntervalId;
  /** Minor units. `null` until a provider and real pricing are configured. */
  amountMinor: number | null;
};

export type BillingPlan = {
  code: string;
  interval: BillingIntervalId;
  entitlements: EntitlementKey[];
  prices: PlanPrice[];
};

/** Currency/locale/price/interval configuration layer — never hard-coded in UI. */
export const BILLING_PLANS: BillingPlan[] = [
  {
    code: "premium_monthly",
    interval: "month",
    entitlements: PREMIUM_ENTITLEMENTS,
    prices: [
      { currency: "USD", interval: "month", amountMinor: null },
      { currency: "AED", interval: "month", amountMinor: null },
      { currency: "EUR", interval: "month", amountMinor: null },
    ],
  },
  {
    code: "premium_annual",
    interval: "year",
    entitlements: PREMIUM_ENTITLEMENTS,
    prices: [
      { currency: "USD", interval: "year", amountMinor: null },
      { currency: "AED", interval: "year", amountMinor: null },
      { currency: "EUR", interval: "year", amountMinor: null },
    ],
  },
];

export const DEFAULT_CURRENCY = "USD";

export function planByCode(code: string): BillingPlan | undefined {
  return BILLING_PLANS.find((plan) => plan.code === code);
}

export function priceFor(plan: BillingPlan, currency: string): PlanPrice | undefined {
  return plan.prices.find((price) => price.currency === currency) ?? plan.prices[0];
}

/** True only when a real provider adapter is wired and configured. */
export function isCheckoutConnected(): boolean {
  return BILLING_PROVIDER !== "none";
}
