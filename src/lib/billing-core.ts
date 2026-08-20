/**
 * LYVE billing — shared, browser-safe types and pure lifecycle mapping.
 *
 * Nothing here reads the environment, touches the database, or grants access.
 * It is the single vocabulary shared by the provider adapters, the server
 * functions, the webhook processor and the UI.
 */
import type { BillingIntervalId, BillingProviderId, EntitlementKey } from "@/config/billing";

export const SUBSCRIPTION_STATUSES = [
  "trialing",
  "active",
  "past_due",
  "paused",
  "canceled",
  "expired",
  "incomplete",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const ENTITLEMENT_SOURCES = ["web", "ios", "android", "promotional", "admin_grant"] as const;
export type EntitlementSource = (typeof ENTITLEMENT_SOURCES)[number];

/**
 * Provider-neutral event vocabulary. Adapters translate their own wire format
 * into exactly these types — provider-specific semantics never leak further in.
 */
export const BILLING_EVENT_TYPES = [
  "checkout.completed",
  "subscription.created",
  "subscription.updated",
  "subscription.resumed",
  "subscription.paused",
  "subscription.canceled",
  "subscription.expired",
  "payment.succeeded",
  "payment.failed",
  "refund.issued",
  "chargeback.created",
] as const;
export type BillingEventType = (typeof BILLING_EVENT_TYPES)[number];

export function isBillingEventType(value: unknown): value is BillingEventType {
  return typeof value === "string" && (BILLING_EVENT_TYPES as readonly string[]).includes(value);
}

/** The normalised shape every adapter must produce from a verified payload. */
export type NormalizedBillingEvent = {
  /** Provider-issued event id. The idempotency key. */
  id: string;
  type: BillingEventType;
  /** Provider event timestamp (ISO). Used for replay diagnostics only. */
  createdAt: string;
  profileId: string;
  /** Provider-side subscription reference. Never shown to members. */
  subscriptionRef: string;
  planCode: string;
  interval: BillingIntervalId;
  currency: string;
  periodStart: string | null;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  trialEndsAt: string | null;
};

/**
 * Subscription lifecycle mapping (documented in docs/12-phase-5-security-audit.md).
 *
 *   checkout.completed / subscription.created → trialing when a trial end is
 *                                               present, otherwise active
 *   subscription.updated                      → active (period fields refreshed)
 *   payment.succeeded                         → active
 *   payment.failed                            → past_due
 *   subscription.paused                       → paused
 *   subscription.resumed                      → active
 *   subscription.canceled                     → canceled (access until period end)
 *   subscription.expired                      → expired
 *   refund.issued / chargeback.created        → immediate entitlement revocation
 *
 * No other transition exists. An unknown type is rejected before this point.
 */
export type LifecycleOutcome =
  | { action: "apply"; status: SubscriptionStatus }
  | { action: "revoke"; reason: "refund" | "chargeback" };

export function mapEventToLifecycle(event: NormalizedBillingEvent): LifecycleOutcome {
  switch (event.type) {
    case "checkout.completed":
    case "subscription.created":
      return { action: "apply", status: event.trialEndsAt ? "trialing" : "active" };
    case "subscription.updated":
    case "subscription.resumed":
    case "payment.succeeded":
      return { action: "apply", status: "active" };
    case "payment.failed":
      return { action: "apply", status: "past_due" };
    case "subscription.paused":
      return { action: "apply", status: "paused" };
    case "subscription.canceled":
      return { action: "apply", status: "canceled" };
    case "subscription.expired":
      return { action: "apply", status: "expired" };
    case "refund.issued":
      return { action: "revoke", reason: "refund" };
    case "chargeback.created":
      return { action: "revoke", reason: "chargeback" };
  }
}

/**
 * Whether a status still carries Premium access. Mirrors the database rule in
 * `billing_apply_subscription`; the database remains the authority.
 */
export function statusGrantsAccess(status: SubscriptionStatus, periodEnd: string | null): boolean {
  if (
    status === "trialing" ||
    status === "active" ||
    status === "past_due" ||
    status === "paused"
  ) {
    return true;
  }
  if (status === "canceled")
    return Boolean(periodEnd && new Date(periodEnd).getTime() > Date.now());
  return false;
}

/* ------------------------------------------------------------------ */
/* Read models returned to the browser. Payment data is never included. */
/* ------------------------------------------------------------------ */

export type MemberSubscription = {
  planCode: string;
  status: SubscriptionStatus;
  interval: BillingIntervalId;
  currency: string | null;
  /** Where the purchase came from (web/ios/android/promotional/admin_grant). */
  source: EntitlementSource;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  trialEndsAt: string | null;
};

export type MemberEntitlement = {
  key: string;
  source: EntitlementSource;
  expiresAt: string | null;
};

export type BillingSnapshot = {
  /** Active provider adapter, resolved server-side. */
  provider: BillingProviderId;
  /** `architecture` until a real provider is connected. */
  stage: string;
  checkoutOffered: boolean;
  checkoutIsLive: boolean;
  portalSupported: boolean;
  currency: string;
  locale: string | null;
  subscription: MemberSubscription | null;
  entitlements: MemberEntitlement[];
  isPremium: boolean;
};

export type CheckoutOutcome = {
  /** `none` = not connected, `test` = mock/sandbox, `live` = real money. */
  mode: "none" | "test" | "live";
  /** Stable message code the UI translates. Never a provider error string. */
  code:
    | "CHECKOUT_NOT_CONNECTED"
    | "TEST_CHECKOUT_CREATED"
    | "CHECKOUT_CREATED"
    | "CHECKOUT_UNAVAILABLE";
  url: string | null;
  sessionId: string | null;
};

export type BillingActionResult = {
  code:
    "OK" | "NOT_SUPPORTED" | "NO_SUBSCRIPTION" | "CHECKOUT_NOT_CONNECTED" | "PROVIDER_UNAVAILABLE";
  /** Portal URL when the provider supports self-service management. */
  url?: string | null;
};

export type AdminBillingRow = {
  profileId: string;
  planCode: string;
  provider: BillingProviderId;
  purchaseSource: EntitlementSource;
  status: SubscriptionStatus;
  interval: BillingIntervalId;
  currency: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  trialEndsAt: string | null;
  /** Null for `billing.view.limited` holders. */
  providerSubscriptionId: string | null;
  entitlementKeys: string[];
  createdAt: string;
};

export type AdminEntitlementRow = {
  id: string;
  key: string;
  source: EntitlementSource;
  startsAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  reason: string | null;
  revokeReason: string | null;
  createdAt: string;
};

export const ADMIN_GRANT_MIN_DAYS = 1;
export const ADMIN_GRANT_MAX_DAYS = 365;
export const ADMIN_GRANT_REASON_MIN = 5;

export type PremiumFeatureKey = EntitlementKey;
