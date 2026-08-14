/**
 * LYVE billing provider abstraction.
 *
 * Every payment integration — today `none` and `mock`, tomorrow web (Stripe /
 * Paddle) and the mobile stores — implements this one interface. No other
 * module in the application may branch on a provider name; it asks the
 * resolver for the configured adapter and calls these methods.
 *
 * Nothing an adapter returns is trusted as authorisation. Adapters translate
 * wire formats and verify signatures; only the database changes access.
 */
import type { BillingIntervalId, BillingProviderId } from "@/config/billing";
import type { CheckoutOutcome, NormalizedBillingEvent } from "@/lib/billing-core";

export type CheckoutRequest = {
  /** Derived from the authenticated session — never from the request body. */
  profileId: string;
  planCode: string;
  interval: BillingIntervalId;
  currency: string;
};

export type PortalRequest = {
  profileId: string;
  providerSubscriptionId: string | null;
};

export type WebhookInput = {
  rawBody: string;
  headers: Headers;
  /** Provider webhook secret, read from the server environment by the caller. */
  secret: string | null;
};

export type WebhookFailureReason =
  | "NOT_CONFIGURED"
  | "MISSING_SIGNATURE"
  | "INVALID_SIGNATURE"
  | "MISSING_TIMESTAMP"
  | "STALE_TIMESTAMP"
  | "MALFORMED_PAYLOAD"
  | "UNSUPPORTED_EVENT";

export type WebhookVerification =
  | { ok: true; event: NormalizedBillingEvent }
  | { ok: false; reason: WebhookFailureReason };

export interface BillingProvider {
  readonly id: BillingProviderId;
  /** `true` only when real money can move. Drives every "TEST ONLY" label. */
  readonly isLive: boolean;
  readonly supportsCheckout: boolean;
  readonly supportsPortal: boolean;
  readonly supportsWebhooks: boolean;
  /** Whether the adapter can cancel/resume without a provider portal. */
  readonly supportsSelfServiceLifecycle: boolean;

  createCheckout(request: CheckoutRequest): Promise<CheckoutOutcome>;
  createPortalSession(request: PortalRequest): Promise<{ supported: boolean; url: string | null }>;
  verifyWebhook(input: WebhookInput): Promise<WebhookVerification>;
}
