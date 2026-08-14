/**
 * The `none` adapter: payments are not connected.
 *
 * It refuses every money-adjacent operation and rejects every webhook, so a
 * mis-deployed environment can never accidentally accept provider traffic.
 */
import type { BillingProvider } from "./provider";

export const noneProvider: BillingProvider = {
  id: "none",
  isLive: false,
  supportsCheckout: false,
  supportsPortal: false,
  supportsWebhooks: false,
  supportsSelfServiceLifecycle: false,

  async createCheckout() {
    return { mode: "none", code: "CHECKOUT_NOT_CONNECTED", url: null, sessionId: null };
  },

  async createPortalSession() {
    return { supported: false, url: null };
  },

  async verifyWebhook() {
    return { ok: false, reason: "NOT_CONFIGURED" };
  },
};
