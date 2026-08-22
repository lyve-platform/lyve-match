/**
 * StoreKit 2 bridge — browser-safe.
 *
 * The native shell exposes a minimal `LyveIAP` plugin that performs the
 * purchase with StoreKit 2 and hands back the signed transaction (JWS).
 * The client NEVER grants entitlements: the JWS is posted to the server,
 * which verifies it against the App Store Server API and links it.
 */
import { isIosApp } from "@/lib/native/runtime";
import { iapLog } from "@/lib/native/iap-log";
import type { StoreLinkResult } from "@/lib/billing/store-core";
import { registerPlugin } from "@capacitor/core";

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

const nativeIap = registerPlugin<LyveIapPlugin>("LyveIAP");

function plugin(): LyveIapPlugin | undefined {
  return isIosApp() && Capacitor.isPluginAvailable("LyveIAP") ? nativeIap : undefined;
}

/** Purchases are only offered where StoreKit actually exists. */
export function iapAvailable(): boolean {
  return isIosApp() && plugin() !== undefined;
}

/** Why StoreKit is (not) usable — surfaced by the Premium diagnostics panel. */
export type IapAvailability =
  | { available: true }
  | {
      available: false;
      reason: "not_native" | "plugin_missing";
    };

export function iapAvailability(): IapAvailability {
  if (!isIosApp()) return { available: false, reason: "not_native" };
  if (!plugin()) return { available: false, reason: "plugin_missing" };
  return { available: true };
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
    const products = (result?.products ?? []).filter(
      (product) =>
        typeof product?.productId === "string" && typeof product?.displayPrice === "string",
    );
    if (products.length < productIds.length) {
      iapLog("warn", "products.incomplete", {
        requested: productIds.length,
        returned: products.length,
      });
    } else {
      iapLog("info", "products.loaded", { count: products.length });
    }
    return products;
  } catch (error) {
    iapLog("error", "products.failed", { message: String((error as Error)?.message ?? error) });
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
  if (!iap) {
    iapLog("error", "purchase.unavailable", { productId });
    return { kind: "unavailable" };
  }
  iapLog("info", "purchase.started", { productId });
  try {
    const result = await iap.purchase({ productId });
    if (result?.cancelled) {
      iapLog("warn", "purchase.cancelled", { productId });
      return { kind: "cancelled" };
    }
    if (typeof result?.jws === "string" && result.jws.length > 0) {
      iapLog("info", "purchase.signed", { productId });
      return { kind: "receipt", receipt: result.jws };
    }
    iapLog("error", "purchase.no_transaction", { productId, pending: result?.pending === true });
    return { kind: "failed" };
  } catch (error) {
    iapLog("error", "purchase.threw", {
      productId,
      message: String((error as Error)?.message ?? error),
    });
    return { kind: "failed" };
  }
}

/** Returns signed transactions StoreKit already knows about for this Apple ID. */
export async function restoreReceipts(): Promise<string[]> {
  const iap = plugin();
  if (!iap) {
    iapLog("warn", "restore.unavailable");
    return [];
  }
  iapLog("info", "restore.started");
  try {
    const result = await iap.restore();
    const receipts = (result?.jws ?? []).filter(
      (value) => typeof value === "string" && value.length > 0,
    );
    iapLog(receipts.length ? "info" : "warn", "restore.transactions", { count: receipts.length });
    return receipts;
  } catch (error) {
    iapLog("error", "restore.threw", { message: String((error as Error)?.message ?? error) });
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
  try {
    const { result } = await link({ data: { store: "apple", receipt: outcome.receipt } });
    iapLog(result === "LINKED" || result === "ALREADY_OWNED" ? "info" : "error", "link.result", {
      result,
    });
    return { outcome, result };
  } catch (error) {
    iapLog("error", "link.threw", { message: String((error as Error)?.message ?? error) });
    return { outcome };
  }
}

export type RestoreSummary = {
  /** StoreKit transactions StoreKit handed back for this Apple ID. */
  found: number;
  /** Transactions the server verified and bound to this account. */
  linked: number;
  /** Distinct server refusal codes, for the diagnostics panel. */
  failures: StoreLinkResult[];
};

/**
 * Restore purchases.
 *
 * StoreKit replays the signed transactions Apple already knows about; each one
 * is posted to the server, which verifies it against the App Store Server API
 * and re-binds entitlements. The client still grants nothing on its own.
 */
export async function restoreAndLink(
  link: (input: {
    data: { store: string; receipt: string };
  }) => Promise<{ result: StoreLinkResult }>,
): Promise<RestoreSummary> {
  const receipts = await restoreReceipts();
  const summary: RestoreSummary = { found: receipts.length, linked: 0, failures: [] };
  for (const receipt of receipts) {
    try {
      const { result } = await link({ data: { store: "apple", receipt } });
      if (result === "LINKED" || result === "ALREADY_OWNED") summary.linked += 1;
      else if (!summary.failures.includes(result)) summary.failures.push(result);
      iapLog(
        result === "LINKED" || result === "ALREADY_OWNED" ? "info" : "error",
        "restore.link.result",
        { result },
      );
    } catch (error) {
      iapLog("error", "restore.link.threw", {
        message: String((error as Error)?.message ?? error),
      });
      if (!summary.failures.includes("VERIFICATION_FAILED")) {
        summary.failures.push("VERIFICATION_FAILED");
      }
    }
  }
  iapLog("info", "restore.finished", {
    found: summary.found,
    linked: summary.linked,
    failures: summary.failures.join(",") || "none",
  });
  return summary;
}
