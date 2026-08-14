/**
 * LYVE mobile store billing — browser-safe, pure logic.
 *
 * Stage: ARCHITECTURE / SANDBOX ONLY. No production Apple or Google
 * credentials are configured and no real purchase can be processed.
 *
 * Nothing in this module reads the environment, touches the database, or
 * grants access. It only translates store vocabulary (Apple App Store Server
 * Notifications V2, Google Real-Time Developer Notifications) into the
 * provider-neutral lifecycle vocabulary LYVE already uses.
 */
import type { BillingIntervalId } from "@/config/billing";
import type { SubscriptionStatus } from "@/lib/billing-core";

export const STORES = ["apple", "google"] as const;
export type StoreId = (typeof STORES)[number];

export function isStoreId(value: unknown): value is StoreId {
  return value === "apple" || value === "google";
}

/** Store environments. `production` is unreachable until credentials exist. */
export const STORE_ENVIRONMENTS = ["sandbox", "production"] as const;
export type StoreEnvironment = (typeof STORE_ENVIRONMENTS)[number];

/**
 * Product catalogue. `store_product_id → plan_code` is resolved SERVER-SIDE
 * from this table; a client-supplied plan or entitlement is never honoured.
 */
export type StoreProduct = {
  store: StoreId;
  productId: string;
  planCode: string;
  interval: BillingIntervalId;
};

export const STORE_PRODUCTS: StoreProduct[] = [
  { store: "apple", productId: "com.lyve.premium.monthly", planCode: "premium_monthly", interval: "month" },
  { store: "apple", productId: "com.lyve.premium.annual", planCode: "premium_annual", interval: "year" },
  { store: "google", productId: "lyve_premium_monthly", planCode: "premium_monthly", interval: "month" },
  { store: "google", productId: "lyve_premium_annual", planCode: "premium_annual", interval: "year" },
];

export function productFor(store: StoreId, productId: string): StoreProduct | undefined {
  return STORE_PRODUCTS.find((p) => p.store === store && p.productId === productId);
}

/** Provider-neutral outcome of a store lifecycle event. */
export type StoreLifecycle = {
  status: SubscriptionStatus;
  /** Immediate entitlement revocation (refund, revoke, chargeback). */
  revoke: boolean;
  cancelAtPeriodEnd: boolean;
  reason: string;
};

const APPLE_MAP: Record<string, StoreLifecycle> = {
  SUBSCRIBED: { status: "active", revoke: false, cancelAtPeriodEnd: false, reason: "subscribed" },
  DID_RENEW: { status: "active", revoke: false, cancelAtPeriodEnd: false, reason: "renewed" },
  OFFER_REDEEMED: { status: "active", revoke: false, cancelAtPeriodEnd: false, reason: "offer_redeemed" },
  DID_CHANGE_RENEWAL_PREF: { status: "active", revoke: false, cancelAtPeriodEnd: false, reason: "plan_change" },
  DID_FAIL_TO_RENEW: { status: "past_due", revoke: false, cancelAtPeriodEnd: false, reason: "billing_retry" },
  GRACE_PERIOD_EXPIRED: { status: "expired", revoke: false, cancelAtPeriodEnd: false, reason: "grace_expired" },
  EXPIRED: { status: "expired", revoke: false, cancelAtPeriodEnd: false, reason: "expired" },
  REFUND: { status: "expired", revoke: true, cancelAtPeriodEnd: false, reason: "refund" },
  REVOKE: { status: "expired", revoke: true, cancelAtPeriodEnd: false, reason: "revocation" },
};

/**
 * Apple. `subtype` refines a few types:
 *   DID_CHANGE_RENEWAL_STATUS + AUTO_RENEW_DISABLED → canceled (access to period end)
 *   DID_CHANGE_RENEWAL_STATUS + AUTO_RENEW_ENABLED  → active
 *   DID_FAIL_TO_RENEW + GRACE_PERIOD                → past_due (grace, access kept)
 */
export function appleLifecycle(type: string, subtype: string | null): StoreLifecycle | null {
  if (type === "DID_CHANGE_RENEWAL_STATUS") {
    return subtype === "AUTO_RENEW_DISABLED"
      ? { status: "canceled", revoke: false, cancelAtPeriodEnd: true, reason: "auto_renew_disabled" }
      : { status: "active", revoke: false, cancelAtPeriodEnd: false, reason: "auto_renew_enabled" };
  }
  if (type === "DID_FAIL_TO_RENEW" && subtype === "GRACE_PERIOD") {
    return { status: "past_due", revoke: false, cancelAtPeriodEnd: false, reason: "grace_period" };
  }
  return APPLE_MAP[type] ?? null;
}

/** Google RTDN subscription notification types (documented numeric codes). */
export const GOOGLE_NOTIFICATION_TYPES: Record<number, StoreLifecycle> = {
  1: { status: "active", revoke: false, cancelAtPeriodEnd: false, reason: "recovered" },
  2: { status: "active", revoke: false, cancelAtPeriodEnd: false, reason: "renewed" },
  3: { status: "canceled", revoke: false, cancelAtPeriodEnd: true, reason: "canceled" },
  4: { status: "active", revoke: false, cancelAtPeriodEnd: false, reason: "purchased" },
  5: { status: "past_due", revoke: false, cancelAtPeriodEnd: false, reason: "on_hold" },
  6: { status: "past_due", revoke: false, cancelAtPeriodEnd: false, reason: "grace_period" },
  7: { status: "active", revoke: false, cancelAtPeriodEnd: false, reason: "restarted" },
  8: { status: "active", revoke: false, cancelAtPeriodEnd: false, reason: "price_change_confirmed" },
  9: { status: "active", revoke: false, cancelAtPeriodEnd: false, reason: "deferred" },
  10: { status: "paused", revoke: false, cancelAtPeriodEnd: false, reason: "paused" },
  11: { status: "active", revoke: false, cancelAtPeriodEnd: false, reason: "pause_schedule_changed" },
  12: { status: "expired", revoke: true, cancelAtPeriodEnd: false, reason: "revoked" },
  13: { status: "expired", revoke: false, cancelAtPeriodEnd: false, reason: "expired" },
};

export function googleLifecycle(notificationType: number): StoreLifecycle | null {
  return GOOGLE_NOTIFICATION_TYPES[notificationType] ?? null;
}

/* ------------------------------------------------------------------ */
/* Reconciliation vocabulary (store API state, not notifications)      */
/* ------------------------------------------------------------------ */

/**
 * Apple App Store Server API subscription status codes.
 *   1 active · 2 expired · 3 billing retry · 4 billing grace · 5 revoked
 * `autoRenew === false` means the member keeps access until period end.
 */
export function appleStatusLifecycle(status: number, autoRenew = true): StoreLifecycle | null {
  switch (status) {
    case 1:
      return autoRenew
        ? { status: "active", revoke: false, cancelAtPeriodEnd: false, reason: "api_active" }
        : { status: "canceled", revoke: false, cancelAtPeriodEnd: true, reason: "api_auto_renew_off" };
    case 2:
      return { status: "expired", revoke: false, cancelAtPeriodEnd: false, reason: "api_expired" };
    case 3:
      return { status: "past_due", revoke: false, cancelAtPeriodEnd: false, reason: "api_billing_retry" };
    case 4:
      return { status: "past_due", revoke: false, cancelAtPeriodEnd: false, reason: "api_grace_period" };
    case 5:
      return { status: "expired", revoke: true, cancelAtPeriodEnd: false, reason: "api_revoked" };
    default:
      return null;
  }
}

/** Google Play Developer API `subscriptionsv2` states. */
export function googleStateLifecycle(state: string, autoRenew = true): StoreLifecycle | null {
  switch (state) {
    case "SUBSCRIPTION_STATE_ACTIVE":
      return autoRenew
        ? { status: "active", revoke: false, cancelAtPeriodEnd: false, reason: "api_active" }
        : { status: "canceled", revoke: false, cancelAtPeriodEnd: true, reason: "api_auto_renew_off" };
    case "SUBSCRIPTION_STATE_IN_GRACE_PERIOD":
      return { status: "past_due", revoke: false, cancelAtPeriodEnd: false, reason: "api_grace_period" };
    case "SUBSCRIPTION_STATE_ON_HOLD":
      return { status: "past_due", revoke: false, cancelAtPeriodEnd: false, reason: "api_on_hold" };
    case "SUBSCRIPTION_STATE_PAUSED":
      return { status: "paused", revoke: false, cancelAtPeriodEnd: false, reason: "api_paused" };
    case "SUBSCRIPTION_STATE_CANCELED":
      return { status: "canceled", revoke: false, cancelAtPeriodEnd: true, reason: "api_canceled" };
    case "SUBSCRIPTION_STATE_EXPIRED":
      return { status: "expired", revoke: false, cancelAtPeriodEnd: false, reason: "api_expired" };
    case "SUBSCRIPTION_STATE_PENDING":
    case "SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED":
      return { status: "incomplete", revoke: false, cancelAtPeriodEnd: false, reason: "api_pending" };
    default:
      return null;
  }
}

/** Authoritative store state for one purchase, as read back from the API. */
export type StoreSnapshot = {
  store: StoreId;
  purchaseRef: string;
  productId: string;
  environment: StoreEnvironment;
  periodStart: string | null;
  periodEnd: string | null;
  lifecycle: StoreLifecycle;
  /** Store-issued marker used to build a stable idempotency key. */
  stateToken: string;
};


/**
 * A store event after authenticity verification, before any database work.
 * `purchaseRef` is the stable ownership key:
 *   Apple  → originalTransactionId
 *   Google → purchaseToken
 * It is NEVER taken from an unverified client body.
 */
export type VerifiedStoreEvent = {
  store: StoreId;
  /** Store-issued notification id — the idempotency key. */
  eventId: string;
  eventType: string;
  eventAt: string;
  purchaseRef: string;
  productId: string;
  environment: StoreEnvironment;
  periodStart: string | null;
  periodEnd: string | null;
  lifecycle: StoreLifecycle;
};

/** Outcome codes returned to callers. Fixed enum; never a provider string. */
export type StoreLinkResult =
  | "LINKED"
  | "ALREADY_OWNED"
  | "OWNED_BY_OTHER_ACCOUNT"
  | "VERIFICATION_FAILED"
  | "UNKNOWN_PRODUCT"
  | "STORE_NOT_CONNECTED"
  | "RATE_LIMITED";

export type StoreEventResult =
  | "PROCESSED"
  | "DUPLICATE_IGNORED"
  | "STALE_IGNORED"
  | "UNLINKED_PURCHASE"
  | "UNSUPPORTED_EVENT"
  | "UNKNOWN_PRODUCT";

/** Member-safe projection of a store purchase. No store tokens are exposed. */
export type MemberStorePurchase = {
  store: StoreId;
  planCode: string;
  status: SubscriptionStatus;
  environment: StoreEnvironment;
  linkedAt: string;
};
