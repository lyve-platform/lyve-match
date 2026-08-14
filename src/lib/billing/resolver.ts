/**
 * Provider resolver — the only place that decides which adapter is active.
 *
 * The active provider comes from the server environment (`BILLING_PROVIDER`),
 * defaults to `none`, and is read lazily so the value is never captured at
 * module scope or shipped to the browser. Unknown or not-yet-implemented
 * providers fail closed to `none` rather than silently doing something.
 */
import { BILLING_PROVIDERS, DEFAULT_BILLING_PROVIDER, type BillingProviderId } from "@/config/billing";
import type { BillingProvider } from "./provider";
import { noneProvider } from "./none";
import { mockProvider } from "./mock";

/** Adapters that actually exist today. Future: stripe/paddle (web), apple, google. */
const IMPLEMENTED: Partial<Record<BillingProviderId, BillingProvider>> = {
  none: noneProvider,
  mock: mockProvider,
};

export function configuredProviderId(): BillingProviderId {
  const raw = process.env["BILLING_PROVIDER"];
  if (raw && (BILLING_PROVIDERS as readonly string[]).includes(raw)) {
    const id = raw as BillingProviderId;
    if (IMPLEMENTED[id]) return id;
  }
  return DEFAULT_BILLING_PROVIDER;
}

export function resolveProvider(id: BillingProviderId = configuredProviderId()): BillingProvider {
  return IMPLEMENTED[id] ?? noneProvider;
}

/** Webhook secret for the active provider. Server environment only. */
export function webhookSecret(): string | null {
  const secret = process.env["BILLING_WEBHOOK_SECRET"];
  return secret && secret.length >= 16 ? secret : null;
}
