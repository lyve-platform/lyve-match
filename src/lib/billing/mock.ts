/**
 * The `mock` adapter: a clearly labelled TEST provider.
 *
 * It exists so the whole billing pipeline — checkout request, webhook,
 * signature verification, replay protection, idempotency, lifecycle mapping —
 * can be exercised end to end without a payment provider and without any real
 * money. It NEVER represents a real payment, and every result it returns is
 * marked `mode: "test"`.
 *
 * Signature scheme (deliberately the shape real providers use):
 *   x-lyve-billing-timestamp: <unix seconds>
 *   x-lyve-billing-signature: sha256=<hex hmac(secret, `${timestamp}.${rawBody}`)>
 *
 * The secret is supplied by the caller from the server environment. There is
 * no fallback and no default: without a secret, verification fails closed.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  isBillingEventType,
  type NormalizedBillingEvent,
} from "@/lib/billing-core";
import type { BillingProvider, WebhookInput, WebhookVerification } from "./provider";

export const MOCK_SIGNATURE_HEADER = "x-lyve-billing-signature";
export const MOCK_TIMESTAMP_HEADER = "x-lyve-billing-timestamp";
/** Anything older than this is treated as a replay attempt. */
export const MOCK_TIMESTAMP_TOLERANCE_SECONDS = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Deterministic test signature. Exported so the security suite can sign. */
export function signMockPayload(secret: string, timestamp: number, rawBody: string): string {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")}`;
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function iso(value: unknown): string | null {
  const text = str(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Strict payload validation. Anything unexpected is rejected, not coerced. */
export function normalizeMockPayload(parsed: unknown): NormalizedBillingEvent | null {
  if (!parsed || typeof parsed !== "object") return null;
  const body = parsed as Record<string, unknown>;
  const data = (body["data"] ?? {}) as Record<string, unknown>;

  const id = str(body["id"]);
  const type = body["type"];
  const profileId = str(data["profile_id"]);
  const subscriptionRef = str(data["subscription_ref"]);
  const planCode = str(data["plan_code"]);
  const interval = str(data["interval"]);
  const currency = str(data["currency"]) ?? "USD";

  if (!id || id.length > 200) return null;
  if (!isBillingEventType(type)) return null;
  if (!profileId || !UUID.test(profileId)) return null;
  if (!subscriptionRef || subscriptionRef.length > 200) return null;
  if (!planCode || planCode.length > 100) return null;
  if (interval !== "month" && interval !== "year") return null;
  if (!/^[A-Z]{3}$/.test(currency)) return null;

  return {
    id,
    type,
    createdAt: iso(body["created_at"]) ?? new Date().toISOString(),
    profileId,
    subscriptionRef,
    planCode,
    interval,
    currency,
    periodStart: iso(data["period_start"]),
    periodEnd: iso(data["period_end"]),
    cancelAtPeriodEnd: data["cancel_at_period_end"] === true,
    trialEndsAt: iso(data["trial_ends_at"]),
  };
}

export const mockProvider: BillingProvider = {
  id: "mock",
  isLive: false,
  supportsCheckout: true,
  supportsPortal: false,
  supportsWebhooks: true,
  supportsSelfServiceLifecycle: true,

  async createCheckout(request) {
    // A test artefact only. No money moves, no entitlement is granted here.
    const sessionId = `mock_cs_${request.profileId.slice(0, 8)}_${Date.now().toString(36)}`;
    return { mode: "test", code: "TEST_CHECKOUT_CREATED", url: null, sessionId };
  },

  async createPortalSession() {
    return { supported: false, url: null };
  },

  async verifyWebhook({ rawBody, headers, secret }: WebhookInput): Promise<WebhookVerification> {
    if (!secret) return { ok: false, reason: "NOT_CONFIGURED" };

    const signature = headers.get(MOCK_SIGNATURE_HEADER);
    if (!signature) return { ok: false, reason: "MISSING_SIGNATURE" };

    const timestampHeader = headers.get(MOCK_TIMESTAMP_HEADER);
    if (!timestampHeader) return { ok: false, reason: "MISSING_TIMESTAMP" };

    const timestamp = Number(timestampHeader);
    if (!Number.isFinite(timestamp)) return { ok: false, reason: "MISSING_TIMESTAMP" };

    const skew = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
    if (skew > MOCK_TIMESTAMP_TOLERANCE_SECONDS) return { ok: false, reason: "STALE_TIMESTAMP" };

    if (!safeEqual(signature, signMockPayload(secret, timestamp, rawBody))) {
      return { ok: false, reason: "INVALID_SIGNATURE" };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return { ok: false, reason: "MALFORMED_PAYLOAD" };
    }

    const event = normalizeMockPayload(parsed);
    if (!event) return { ok: false, reason: "MALFORMED_PAYLOAD" };
    return { ok: true, event };
  },
};
