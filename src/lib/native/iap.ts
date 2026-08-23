/**
 * Native store purchase bridge — browser-safe.
 *
 * iOS  → `LyveIAP` (StoreKit 2), receipt = signed transaction (JWS).
 * Android → `LyveBilling` (Google Play Billing), receipt = purchase token.
 *
 * The client NEVER grants entitlements: the receipt is posted to the server,
 * which verifies it against the App Store Server API / Play Developer API and
 * links it to the signed-in account.
 */
import { isAndroidApp, isIosApp } from "@/lib/native/runtime";
import { iapLog } from "@/lib/native/iap-log";
import type { StoreId, StoreLinkResult } from "@/lib/billing/store-core";
import { Capacitor, registerPlugin } from "@capacitor/core";

export type IapProductId =
  | `app.lyve.ios.premium.${"monthly" | "annual"}`
  | `premium_${"monthly" | "annual"}`;

export type IapProduct = {
  productId: string;
  displayPrice: string;
  currencyCode?: string;
  title?: string;
};

type LyveIapPlugin = {
  products(options: {
    productIds: string[];
  }): Promise<{ products?: IapProduct[]; storefront?: string; missing?: string[] }>;
  purchase(options: {
    productId: string;
  }): Promise<{ jws?: string; cancelled?: boolean; pending?: boolean }>;
  restore(): Promise<{ jws?: string[] }>;
  /** Play only: confirms a purchase the server already verified. */
  acknowledge?(options: { purchaseToken: string }): Promise<{ acknowledged?: boolean }>;
};

const nativeIap = registerPlugin<LyveIapPlugin>("LyveIAP");
const nativeBilling = registerPlugin<LyveIapPlugin>("LyveBilling");

type Bridge = { api: LyveIapPlugin; store: StoreId };

function bridge(): Bridge | undefined {
  if (isIosApp() && Capacitor.isPluginAvailable("LyveIAP")) {
    return { api: nativeIap, store: "apple" };
  }
  if (isAndroidApp() && Capacitor.isPluginAvailable("LyveBilling")) {
    return { api: nativeBilling, store: "google" };
  }
  return undefined;
}

function plugin(): LyveIapPlugin | undefined {
  return bridge()?.api;
}

/** The store backing in-app purchases on this device, if any. */
export function activeStore(): StoreId | undefined {
  return bridge()?.store;
}

/** Purchases are only offered where a native store bridge actually exists. */
export function iapAvailable(): boolean {
  return plugin() !== undefined;
}

/** Why the store is (not) usable — surfaced by the Premium diagnostics panel. */
export type IapAvailability =
  | { available: true }
  | {
      available: false;
      reason: "not_native" | "plugin_missing";
    };

export function iapAvailability(): IapAvailability {
  if (!isIosApp() && !isAndroidApp()) return { available: false, reason: "not_native" };
  if (!plugin()) return { available: false, reason: "plugin_missing" };
  return { available: true };
}

/** Store product id for a LYVE plan code, per platform. */
export function productIdForPlan(planCode: string): IapProductId | undefined {
  const store = activeStore() ?? (isAndroidApp() ? "google" : "apple");
  if (store === "google") {
    if (planCode === "premium_monthly") return "premium_monthly";
    if (planCode === "premium_annual") return "premium_annual";
    return undefined;
  }
  if (planCode === "premium_monthly") return "app.lyve.ios.premium.monthly";
  if (planCode === "premium_annual") return "app.lyve.ios.premium.annual";
  return undefined;
}

/**
 * Store-localized prices. LYVE never hard-codes a price: what the member sees
 * is exactly what StoreKit / Play reports for their storefront.
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
        storefront: result?.storefront ?? "unknown",
        missing: (result?.missing ?? []).join(",") || "unknown",
      });
    } else {
      iapLog("info", "products.loaded", {
        count: products.length,
        storefront: result?.storefront ?? "unknown",
      });
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
  /** The store says this account already owns the subscription. */
  | { kind: "already_owned" }
  | { kind: "receipt"; receipt: string };

/** Store errors that mean "you already bought this", not "the purchase failed". */
function isAlreadyOwned(message: string): boolean {
  return /purchase_failed:7\b/.test(message) || /already\s*(own|subscrib|purchas)/i.test(message);
}

/** Runs the native purchase sheet and returns the store receipt. */
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
    const message = String((error as Error)?.message ?? error);
    if (isAlreadyOwned(message)) {
      iapLog("warn", "purchase.already_owned", { productId });
      return { kind: "already_owned" };
    }
    iapLog("error", "purchase.threw", { productId, message });
    return { kind: "failed" };
  }
}


/** Returns receipts the store already knows about for this account. */
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
 * Play requires acknowledging a purchase within three days or it is refunded.
 * It runs only AFTER the server verified and linked the purchase.
 */
async function acknowledgeIfPlay(receipt: string): Promise<void> {
  const active = bridge();
  if (!active || active.store !== "google" || !active.api.acknowledge) return;
  try {
    const result = await active.api.acknowledge({ purchaseToken: receipt });
    iapLog(result?.acknowledged ? "info" : "warn", "acknowledge.result", {
      acknowledged: result?.acknowledged === true,
    });
  } catch (error) {
    iapLog("error", "acknowledge.threw", { message: String((error as Error)?.message ?? error) });
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
  const store = activeStore() ?? "apple";
  const outcome = await purchaseProduct(productId);
  if (outcome.kind === "already_owned" || outcome.kind === "failed") {
    // The store refused a second purchase because this account already owns the
    // subscription — replay the existing purchase so the server can link it.
    const summary = await restoreAndLink(link);
    if (summary.linked > 0) return { outcome, result: "ALREADY_OWNED" };
    const failure = summary.failures[0];
    return failure ? { outcome, result: failure } : { outcome };

  }
  if (outcome.kind !== "receipt") return { outcome };

  try {
    const { result } = await link({ data: { store, receipt: outcome.receipt } });
    const linked = result === "LINKED" || result === "ALREADY_OWNED";
    iapLog(linked ? "info" : "error", "link.result", { result, store });
    if (linked) await acknowledgeIfPlay(outcome.receipt);
    return { outcome, result };
  } catch (error) {
    iapLog("error", "link.threw", { message: String((error as Error)?.message ?? error) });
    return { outcome };
  }
}

export type RestoreSummary = {
  /** Receipts the store handed back for this account. */
  found: number;
  /** Receipts the server verified and bound to this account. */
  linked: number;
  /** Distinct server refusal codes, for the diagnostics panel. */
  failures: StoreLinkResult[];
};

/**
 * Restore purchases.
 *
 * The store replays the purchases it already knows about; each one is posted
 * to the server, which verifies it against the store API and re-binds
 * entitlements. The client still grants nothing on its own.
 */
export async function restoreAndLink(
  link: (input: {
    data: { store: string; receipt: string };
  }) => Promise<{ result: StoreLinkResult }>,
): Promise<RestoreSummary> {
  const store = activeStore() ?? "apple";
  const receipts = await restoreReceipts();
  const summary: RestoreSummary = { found: receipts.length, linked: 0, failures: [] };
  for (const receipt of receipts) {
    try {
      const { result } = await link({ data: { store, receipt } });
      const linked = result === "LINKED" || result === "ALREADY_OWNED";
      if (linked) {
        summary.linked += 1;
        await acknowledgeIfPlay(receipt);
      } else if (!summary.failures.includes(result)) summary.failures.push(result);
      iapLog(linked ? "info" : "error", "restore.link.result", { result, store });
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
