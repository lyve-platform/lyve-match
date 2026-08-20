/**
 * The `apple` adapter: Apple App Store billing for iOS.
 *
 * Real purchases happen inside the iOS app via StoreKit 2. The web view
 * running inside the Capacitor shell sees the same Premium page but delegates
 * the actual transaction to the native bridge. This adapter therefore does not
 * offer a web checkout flow and does not manage subscriptions through a portal.
 *
 * Server-side verification of the App Store Server Notification JWS and the
 * StoreKit transaction JWS is handled by the dedicated store modules
 * (`store-webhook.server.ts` and `store-verify.server.ts`) which are wired to
 * `/api/public/webhooks/apple` and to the native `linkStorePurchase` call.
 */
import type { BillingProvider } from "./provider";
import type { CheckoutOutcome } from "@/lib/billing-core";

export const appleProvider: BillingProvider = {
  id: "apple",
  isLive: true,
  supportsCheckout: true,
  supportsPortal: false,
  supportsWebhooks: false,
  supportsSelfServiceLifecycle: false,

  async createCheckout(): Promise<CheckoutOutcome> {
    return {
      mode: "live",
      code: "CHECKOUT_UNAVAILABLE",
      url: null,
      sessionId: null,
    };
  },

  async createPortalSession() {
    return { supported: false, url: null };
  },

  async verifyWebhook() {
    return { ok: false, reason: "UNSUPPORTED_EVENT" };
  },
};
