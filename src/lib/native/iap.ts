/**
 * StoreKit 2 bridge — browser-safe.
 *
 * The native shell exposes a minimal `LyveIAP` plugin that performs the
 * purchase with StoreKit 2 and hands back the signed transaction (JWS).
 * The client NEVER grants entitlements: the JWS is posted to the server,
 * which verifies it against the App Store Server API and links it.
 */
import { isIosApp } from "@/lib/native/runtime";
import type { StoreLinkResult } from "@/lib/billing/store-core";

export type IapProductId = `app.lyve.ios.premium.${"monthly" | "annual"}`;

export type IapProduct = {
  productId: string;
  displayPrice: string;
  currencyCode?: string;
  title?: string;
};

type LyveIapPlugin = {
  products(options: { productIds: string[] }): Promise<{ products?: IapProduct[] }>;
  purchase(options: {
    productId: string;
  }): Promise<{ jws?: string; cancelled?: boolean; pending?: boolean }>;
  restore(): Promise<{ jws?: string[] }>;
};

function plugin(): LyveIapPlugin | undefined {
  if (typeof window === "undefined") return undefined;
  const plugins = (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } })
    .Capacitor?.Plugins;
  return plugins?.["LyveIAP"] as LyveIapPlugin | undefined;
}

/** Purchases are only offered where StoreKit actually exists. */
export function iapAvailable(): boolean {
  return isIosApp() && plugin() !== undefined;
}

/** Apple product id for a LYVE plan code. */
export function productIdForPlan(planCode: string): IapProductId | undefined {
  if (planCode === "premium_monthly") return "app.lyve.ios.premium.monthly";
  if (planCode === "premium_annual") return "app.lyve.ios.premium.annual";
  return undefined;
}

/**
 * App Store localized prices. LYVE never hard-codes a price: what the member
 * sees is exactly what StoreKit reports for their storefront.
 */
export async function fetchProducts(productIds: IapProductId[]): Promise<IapProduct[]> {
  const iap = plugin();
  if (!iap) return [];
  try {
    const result = await iap.products({ productIds });
    return (result?.products ?? []).filter(
      (product) => typeof product?.productId === "string" && typeof product?.displayPrice === "string",
    );
  } catch {
    return [];
  }
}


export type IapOutcome =
  | { kind: "unavailable" }
  | { kind: "cancelled" }
  | { kind: "failed" }
  | { kind: "receipt"; receipt: string };

/** Runs the StoreKit purchase sheet and returns the signed transaction. */
export async function purchaseProduct(productId: IapProductId): Promise<IapOutcome> {
  const iap = plugin();
  if (!iap) return { kind: "unavailable" };
  try {
    const result = await iap.purchase({ productId });
    if (result?.cancelled) return { kind: "cancelled" };
    if (typeof result?.jws === "string" && result.jws.length > 0) {
      return { kind: "receipt", receipt: result.jws };
    }
    return { kind: "failed" };
  } catch {
    return { kind: "failed" };
  }
}

/** Returns signed transactions StoreKit already knows about for this Apple ID. */
export async function restoreReceipts(): Promise<string[]> {
  const iap = plugin();
  if (!iap) return [];
  try {
    const result = await iap.restore();
    return (result?.jws ?? []).filter((value) => typeof value === "string" && value.length > 0);
  } catch {
    return [];
  }
}

/**
 * Convenience flow: buy, then hand the receipt to the caller-supplied link
 * function (the authenticated `linkStorePurchase` server function).
 */
export async function purchaseAndLink(
  productId: IapProductId,
  link: (input: {
    data: { store: string; receipt: string };
  }) => Promise<{ result: StoreLinkResult }>,
): Promise<{ outcome: IapOutcome; result?: StoreLinkResult }> {
  const outcome = await purchaseProduct(productId);
  if (outcome.kind !== "receipt") return { outcome };
  const { result } = await link({ data: { store: "apple", receipt: outcome.receipt } });
  return { outcome, result };
}
