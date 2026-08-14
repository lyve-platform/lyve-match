/**
 * LYVE Phase 6C — production-store readiness suite.
 *
 * Production purchases are NOT enabled. This suite proves the properties that
 * must hold BEFORE they are, by driving the real code paths with simulated
 * production configuration (no real Apple or Google credentials exist here and
 * none are required):
 *
 *   - a sandbox deployment can never operate production, and vice versa
 *   - any environment/credential mismatch fails closed, never falls back
 *   - a production deployment has no HMAC test rail and no attacker-choosable
 *     trust anchors
 *   - renewal, refund, revocation, cancellation, expiry and reconciliation all
 *     resolve to the right access decision
 *   - ownership, duplicate and out-of-order protections still hold
 *   - rate limiting and monitoring never carry a receipt or purchase token
 *
 * Run:  bun run tests/security/phase6c-production.ts   (or via run-all.ts)
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import fixtures from "../fixtures/store-certs.json";
import { b64u, bytesToB64u, verifyAppleJws } from "../../src/lib/billing/jws.server";
import {
  appleConfig,
  appleRail,
  appleTrustedRoots,
  configuredStoreEnvironment,
  googleConfig,
  googleRail,
  hasMisplacedAppleCredentials,
  hasMisplacedGoogleCredentials,
  type AppleConfig,
  type GoogleConfig,
} from "../../src/lib/billing/store-env.server";
import { parseAppleSubscriptionResponse, fetchAppleSubscriptionState } from "../../src/lib/billing/apple-store.server";
import {
  authenticatePubSubPush,
  fetchGoogleSubscriptionState,
  parseGoogleSubscriptionResponse,
} from "../../src/lib/billing/google-store.server";
import {
  storeMode,
  verifyStorePurchase,
  verifyStoreNotification,
  buildSandboxReceipt,
  storeSecret,
} from "../../src/lib/billing/store-verify.server";
import { productFor } from "../../src/lib/billing/store-core";
import { reconciliationEventId, snapshotToEvent } from "../../src/lib/billing/store-reconcile.server";
import { RATE_LIMITS, refDigest, sanitizeDetails } from "../../src/lib/billing/store-ops.server";
import { PREMIUM_ENTITLEMENTS } from "../../src/config/billing";

const url = process.env["SUPABASE_URL"]!;
const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
if (!url || !publishableKey || !serviceKey) {
  console.error("Missing SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, evidence: unknown = "") {
  if (ok) {
    passed += 1;
    console.log(`PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${name} ${evidence ? `→ ${JSON.stringify(evidence)}` : ""}`);
  }
}

/* ------------------------------------------------------------------ */
/* Environment harness                                                  */
/* ------------------------------------------------------------------ */

const STORE_VARS = [
  "LYVE_STORE_ENVIRONMENT",
  "APPLE_IAP_ISSUER_ID",
  "APPLE_IAP_KEY_ID",
  "APPLE_IAP_PRIVATE_KEY",
  "APPLE_IAP_BUNDLE_ID",
  "APPLE_IAP_SANDBOX_ISSUER_ID",
  "APPLE_IAP_SANDBOX_KEY_ID",
  "APPLE_IAP_SANDBOX_PRIVATE_KEY",
  "APPLE_IAP_SANDBOX_BUNDLE_ID",
  "APPLE_SANDBOX_ROOT_FINGERPRINTS",
  "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON",
  "GOOGLE_PLAY_PACKAGE_NAME",
  "GOOGLE_PLAY_SANDBOX_SERVICE_ACCOUNT_JSON",
  "GOOGLE_PLAY_SANDBOX_PACKAGE_NAME",
  "GOOGLE_RTDN_AUDIENCE",
  "GOOGLE_RTDN_SERVICE_ACCOUNT_EMAIL",
  "GOOGLE_RTDN_SANDBOX_AUDIENCE",
  "GOOGLE_RTDN_SANDBOX_SERVICE_ACCOUNT_EMAIL",
] as const;

/** Runs `fn` with a pristine store environment plus `vars`, then restores. */
async function withStoreEnv<T>(vars: Record<string, string>, fn: () => Promise<T> | T): Promise<T> {
  const saved = new Map<string, string | undefined>();
  for (const name of STORE_VARS) {
    saved.set(name, process.env[name]);
    delete process.env[name];
  }
  for (const [name, value] of Object.entries(vars)) process.env[name] = value;
  try {
    return await fn();
  } finally {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

const APPLE_PROD_CREDS = {
  LYVE_STORE_ENVIRONMENT: "production",
  APPLE_IAP_ISSUER_ID: "11111111-2222-3333-4444-555555555555",
  APPLE_IAP_KEY_ID: "PRODKEY123",
  APPLE_IAP_PRIVATE_KEY: fixtures.leafPrivateKeyPem,
  APPLE_IAP_BUNDLE_ID: "com.lyve.app",
};

const SERVICE_ACCOUNT_JSON = JSON.stringify({
  type: "service_account",
  client_email: "lyve-play@lyve-prod.iam.gserviceaccount.com",
  private_key: fixtures.leafPrivateKeyPem,
});

const GOOGLE_PROD_CREDS = {
  LYVE_STORE_ENVIRONMENT: "production",
  GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: SERVICE_ACCOUNT_JSON,
  GOOGLE_PLAY_PACKAGE_NAME: "com.lyve.app",
  GOOGLE_RTDN_AUDIENCE: "https://lyve.app/api/public/webhooks/google",
  GOOGLE_RTDN_SERVICE_ACCOUNT_EMAIL: "rtdn-push@lyve-prod.iam.gserviceaccount.com",
};

const APPLE_SANDBOX_CREDS = {
  LYVE_STORE_ENVIRONMENT: "sandbox",
  APPLE_IAP_SANDBOX_ISSUER_ID: "sandbox-issuer",
  APPLE_IAP_SANDBOX_KEY_ID: "SANDKEY123",
  APPLE_IAP_SANDBOX_PRIVATE_KEY: fixtures.leafPrivateKeyPem,
  APPLE_IAP_SANDBOX_BUNDLE_ID: "com.lyve.app.test",
};

/* ------------------------------------------------------------------ */
/* Apple JWS signing with the local test chain                          */
/* ------------------------------------------------------------------ */

function pem(text: string): ArrayBuffer {
  const body = text.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

const leafKey = await crypto.subtle.importKey(
  "pkcs8",
  pem(fixtures.leafPrivateKeyPem),
  { name: "ECDSA", namedCurve: "P-256" },
  false,
  ["sign"],
);

const GOOD_CHAIN = [fixtures.leafB64, fixtures.intermediateB64, fixtures.rootB64];

async function signJws(payload: Record<string, unknown>): Promise<string> {
  const header = b64u(JSON.stringify({ alg: "ES256", x5c: GOOD_CHAIN }));
  const body = b64u(JSON.stringify(payload));
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    leafKey,
    new TextEncoder().encode(`${header}.${body}`) as unknown as ArrayBuffer,
  );
  return `${header}.${body}.${bytesToB64u(new Uint8Array(signature))}`;
}

const NOW = Date.now();
const APPLE_PRODUCT = "com.lyve.premium.monthly";
const GOOGLE_PRODUCT = "lyve_premium_monthly";

/**
 * A production-shaped Apple config. `trustedRootFingerprints` is the LOCAL
 * test root so the response parser can be exercised at all; the separate
 * env-level tests prove a real production deployment accepts no such override.
 */
const applePseudoProd: AppleConfig = {
  environment: "production",
  issuerId: APPLE_PROD_CREDS.APPLE_IAP_ISSUER_ID,
  keyId: APPLE_PROD_CREDS.APPLE_IAP_KEY_ID,
  privateKeyPem: fixtures.leafPrivateKeyPem,
  bundleId: "com.lyve.app",
  apiBase: "https://api.storekit.itunes.apple.com",
  trustedRootFingerprints: [fixtures.rootFingerprint],
};

const googlePseudoProd: GoogleConfig = {
  environment: "production",
  clientEmail: "lyve-play@lyve-prod.iam.gserviceaccount.com",
  privateKeyPem: fixtures.leafPrivateKeyPem,
  packageName: "com.lyve.app",
  apiBase: "https://androidpublisher.googleapis.com",
  pushAudience: GOOGLE_PROD_CREDS.GOOGLE_RTDN_AUDIENCE,
  pushServiceAccountEmail: GOOGLE_PROD_CREDS.GOOGLE_RTDN_SERVICE_ACCOUNT_EMAIL,
};

async function appleResponse(
  opts: {
    status?: number;
    environment?: string;
    productId?: string;
    bundleId?: string;
    ref?: string;
    expiresDate?: number | null;
    revocationDate?: number | null;
  } = {},
) {
  const signed = await signJws({
    originalTransactionId: opts.ref ?? "2000000900000001",
    productId: opts.productId ?? APPLE_PRODUCT,
    environment: opts.environment ?? "Production",
    bundleId: opts.bundleId ?? "com.lyve.app",
    purchaseDate: NOW - 86_400_000,
    expiresDate: opts.expiresDate === null ? undefined : (opts.expiresDate ?? NOW + 29 * 86_400_000),
    ...(opts.revocationDate ? { revocationDate: opts.revocationDate } : {}),
  });
  return {
    environment: opts.environment ?? "Production",
    data: [{ lastTransactions: [{ status: opts.status ?? 1, signedTransactionInfo: signed }] }],
  };
}

function googleResponse(overrides: Record<string, unknown> = {}) {
  return {
    subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
    startTime: new Date(NOW - 86_400_000).toISOString(),
    lineItems: [
      {
        productId: GOOGLE_PRODUCT,
        expiryTime: new Date(NOW + 29 * 86_400_000).toISOString(),
        autoRenewingPlan: { autoRenewEnabled: true },
      },
    ],
    ...overrides,
  };
}

function stubFetch(status: number, body: unknown): typeof fetch {
  return (async () =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

/* ------------------------------------------------------------------ */
/* Database lifecycle helpers (mirror the webhook path)                 */
/* ------------------------------------------------------------------ */

const stamp = Date.now();
const password = `Ph6c-audit-${stamp}`;
const created: string[] = [];

type Member = { id: string; client: SupabaseClient };

async function createMember(tag: string): Promise<Member> {
  const email = `p6c-${tag}-${stamp}@lyve.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  created.push(data.user!.id);
  const client = createClient(url, publishableKey, { auth: { persistSession: false } });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  const dob = new Date();
  dob.setFullYear(dob.getFullYear() - 30);
  await client.from("profiles").insert({
    id: data.user!.id,
    first_name: `P6C ${tag}`,
    date_of_birth: dob.toISOString().slice(0, 10),
    gender: "woman",
    relationship_intent: "serious_relationship",
    city: "Dubai",
    country: "AE",
  });
  return { id: data.user!.id, client };
}

function linkArgs(profile: string, ref: string, store: "apple" | "google" = "apple") {
  return {
    p_provider: store,
    p_purchase_ref: ref,
    p_profile: profile,
    p_product_id: store === "apple" ? APPLE_PRODUCT : GOOGLE_PRODUCT,
    p_plan_code: "premium_monthly",
    p_environment: "production",
  };
}

async function applyEvent(event: {
  store: "apple" | "google";
  eventId: string;
  eventAt: string;
  purchaseRef: string;
  status: string;
  cancelAtPeriodEnd?: boolean;
  revoke?: boolean;
  periodEnd?: string | null;
  reason?: string;
}) {
  const productId = event.store === "apple" ? APPLE_PRODUCT : GOOGLE_PRODUCT;
  const product = productFor(event.store, productId)!;
  const claim = await admin
    .from("billing_events")
    .insert({
      provider: event.store,
      provider_event_id: event.eventId,
      event_type: event.reason ?? "test",
      status: "received",
      signature_verified: true,
      event_created_at: event.eventAt,
      payload_summary: { environment: "production" },
    })
    .select("id")
    .single();
  if (claim.error) return "duplicate";
  const { data, error } = await admin.rpc("billing_apply_store_event", {
    p_provider: event.store,
    p_purchase_ref: event.purchaseRef,
    p_event_id: event.eventId,
    p_event_at: event.eventAt,
    p_status: event.status,
    p_plan_code: product.planCode,
    p_interval: product.interval,
    p_currency: "USD",
    p_period_start: new Date(NOW - 86_400_000).toISOString(),
    p_period_end: event.periodEnd ?? new Date(NOW + 29 * 86_400_000).toISOString(),
    p_cancel_at_period_end: event.cancelAtPeriodEnd ?? false,
    p_entitlements: PREMIUM_ENTITLEMENTS,
    p_revoke: event.revoke ?? false,
    p_reason: event.reason ?? "test",
  } as never);
  return error ? `error:${error.code}` : String(data);
}

async function isPremium(member: Member): Promise<boolean> {
  const { data } = await member.client.rpc("my_entitlements");
  return ((data ?? []) as Array<{ key: string }>).some((row) => row.key === "premium");
}

async function cleanup() {
  for (const id of created) await admin.auth.admin.deleteUser(id).catch(() => undefined);
}

/* ================================================================== */

async function main() {
  /* ============ A. Production credential isolation ============ */

  await withStoreEnv({}, () => {
    check("A1 with no store credentials a sandbox deployment falls back only to the test rail", appleRail() === "hmac");
    check("A2 default deployment environment is sandbox, never production", configuredStoreEnvironment() === "sandbox");
  });

  await withStoreEnv(APPLE_PROD_CREDS, () => {
    const config = appleConfig();
    check("A3 production credentials resolve only in a production deployment", config.ok && config.config.environment === "production", config);
    check("A4 production Apple traffic targets the production App Store host", config.ok && config.config.apiBase === "https://api.storekit.itunes.apple.com");
    check("A5 a production deployment accepts no attacker-choosable trust anchor", appleTrustedRoots().length === 0);
    check("A6 production runs the real store rail, never the HMAC test rail", appleRail() === "api");
    check("A7 store mode reports production only with production credentials", storeMode() === "production", storeMode());
  });

  await withStoreEnv({ ...APPLE_PROD_CREDS, APPLE_SANDBOX_ROOT_FINGERPRINTS: fixtures.rogueRootFingerprint }, () => {
    check("A8 a root-fingerprint override is ignored in production", appleTrustedRoots().length === 0);
  });

  await withStoreEnv({ ...APPLE_SANDBOX_CREDS, ...APPLE_PROD_CREDS, LYVE_STORE_ENVIRONMENT: "production" }, async () => {
    check("A9 sandbox credentials present in a production deployment are a misconfiguration", hasMisplacedAppleCredentials());
    check("A10 a misconfigured deployment refuses to verify purchases", (await verifyStorePurchase("apple", "x")).ok === false);
    const verification = await verifyStorePurchase("apple", "x");
    check("A11 the refusal is MISCONFIGURED, not a fallback", !verification.ok && verification.reason === "MISCONFIGURED", verification);
    check("A12 a misconfigured deployment reports the store as disabled", storeMode() === "disabled", storeMode());
  });

  await withStoreEnv({ ...APPLE_SANDBOX_CREDS, ...APPLE_PROD_CREDS, LYVE_STORE_ENVIRONMENT: "sandbox" }, async () => {
    check("A13 production credentials present in a sandbox deployment are a misconfiguration", hasMisplacedAppleCredentials());
    const verification = await verifyStoreNotification("apple", "{}", new Headers());
    check("A14 a misconfigured deployment refuses notifications too", !verification.ok && verification.reason === "MISCONFIGURED", verification);
  });

  await withStoreEnv({ LYVE_STORE_ENVIRONMENT: "production" }, async () => {
    check("A15 production without credentials trusts nothing (rail none)", appleRail() === "none" && googleRail() === "none");
    check("A16 production without credentials is disabled, not sandbox", storeMode() === "disabled", storeMode());
    const verification = await verifyStorePurchase("apple", "anything");
    check("A17 an unconfigured production deployment refuses purchases", !verification.ok && verification.reason === "NOT_CONFIGURED", verification);
  });

  await withStoreEnv({ LYVE_STORE_ENVIRONMENT: "production", STORE_SANDBOX_SECRET: "x".repeat(40) }, async () => {
    const secret = process.env["STORE_SANDBOX_SECRET"]!;
    const receipt = buildSandboxReceipt(secret, {
      store: "apple",
      purchase_ref: "sandbox-forged",
      product_id: APPLE_PRODUCT,
      environment: "sandbox",
    });
    const verification = await verifyStorePurchase("apple", receipt);
    check("A18 the sandbox HMAC rail cannot operate a production deployment", !verification.ok, verification);
    check("A19 a sandbox-signed receipt never yields production access", !verification.ok && verification.reason === "NOT_CONFIGURED", verification);
  });

  await withStoreEnv({ ...APPLE_PROD_CREDS, APPLE_IAP_PRIVATE_KEY: "not-a-key" }, () => {
    const config = appleConfig();
    check("A20 a malformed production key is rejected, not ignored", !config.ok && config.reason === "INVALID_CREDENTIAL", config);
    check("A21 an invalid credential disables the store rather than downgrading it", appleRail() === "none");
  });

  await withStoreEnv({ LYVE_STORE_ENVIRONMENT: "production", APPLE_IAP_ISSUER_ID: "only-one" }, () => {
    const config = appleConfig();
    check("A22 a partially configured production store is not configured", !config.ok && config.reason === "NOT_CONFIGURED", config);
  });

  await withStoreEnv(GOOGLE_PROD_CREDS, () => {
    const config = googleConfig();
    check("A23 production Play credentials resolve to the production package", config.ok && config.config.packageName === "com.lyve.app");
    check("A24 production Play push expectations are pinned", config.ok && config.config.pushAudience === GOOGLE_PROD_CREDS.GOOGLE_RTDN_AUDIENCE && config.config.pushServiceAccountEmail === GOOGLE_PROD_CREDS.GOOGLE_RTDN_SERVICE_ACCOUNT_EMAIL);
    check("A25 production Play runs the real API rail", googleRail() === "api");
  });

  await withStoreEnv({ ...GOOGLE_PROD_CREDS, GOOGLE_PLAY_SANDBOX_PACKAGE_NAME: "com.lyve.app.test" }, async () => {
    check("A26 sandbox Play credentials in production are a misconfiguration", hasMisplacedGoogleCredentials());
    const verification = await verifyStorePurchase("google", "token");
    check("A27 the misconfigured Play store refuses purchases", !verification.ok && verification.reason === "MISCONFIGURED", verification);
  });

  await withStoreEnv({ ...GOOGLE_PROD_CREDS, GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: "{not json" }, () => {
    const config = googleConfig();
    check("A28 an unparseable service account is rejected", !config.ok && config.reason === "INVALID_CREDENTIAL", config);
  });

  await withStoreEnv({ ...GOOGLE_PROD_CREDS, GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: "a@b.c" }) }, () => {
    const config = googleConfig();
    check("A29 a service account without a key is rejected", !config.ok && config.reason === "INVALID_CREDENTIAL", config);
  });

  /* ============ B. Production webhook authentication ============ */

  await withStoreEnv(APPLE_PROD_CREDS, async () => {
    const notification = JSON.stringify({ signedPayload: await signJws({ notificationType: "DID_RENEW" }) });
    const verification = await verifyStoreNotification("apple", notification, new Headers());
    check("B1 a self-signed Apple notification is refused in production", !verification.ok && verification.reason === "INVALID_SIGNATURE", verification);
  });

  await withStoreEnv(APPLE_PROD_CREDS, async () => {
    const verification = await verifyStoreNotification("apple", JSON.stringify({ notificationType: "DID_RENEW" }), new Headers());
    check("B2 an unsigned Apple notification is refused in production", !verification.ok && verification.reason === "MISSING_SIGNATURE", verification);
  });

  await withStoreEnv(APPLE_PROD_CREDS, async () => {
    const headers = new Headers({ "x-lyve-store-signature": "sha256=deadbeef", "x-lyve-store-timestamp": String(Math.floor(Date.now() / 1000)) });
    const verification = await verifyStoreNotification("apple", "{}", headers);
    check("B3 the sandbox HMAC header is meaningless in production", !verification.ok, verification);
  });

  await withStoreEnv(GOOGLE_PROD_CREDS, async () => {
    const verification = await verifyStoreNotification("google", JSON.stringify({ message: {} }), new Headers());
    check("B4 an RTDN push without an OIDC token is refused", !verification.ok && verification.reason === "MISSING_SIGNATURE", verification);
  });

  {
    const push = await authenticatePubSubPush(new Headers({ authorization: "Bearer not.a.token" }), {
      config: googlePseudoProd,
      jwks: { keys: [] },
    });
    check("B5 an unverifiable push token is refused", !push.ok && push.reason === "INVALID_TOKEN", push);
  }
  {
    const push = await authenticatePubSubPush(new Headers({ authorization: "Bearer x" }), {
      config: { ...googlePseudoProd, pushAudience: null },
      jwks: { keys: [] },
    });
    check("B6 a production RTDN endpoint without pinned push expectations is closed, not open", !push.ok && push.reason === "PUSH_NOT_CONFIGURED", push);
  }

  /* ============ C. Production receipt / token verification ============ */

  {
    const parsed = await parseAppleSubscriptionResponse(await appleResponse(), applePseudoProd, NOW);
    check("C1 a production Apple purchase verifies from the store API", parsed.ok && parsed.snapshot.environment === "production", parsed);
    check("C2 the verified purchase maps to a known LYVE plan", parsed.ok && productFor("apple", parsed.snapshot.productId)?.planCode === "premium_monthly");
    check("C3 access derives from store status, not the client", parsed.ok && parsed.snapshot.lifecycle.status === "active");
  }
  {
    const parsed = await parseAppleSubscriptionResponse(await appleResponse({ environment: "Sandbox" }), applePseudoProd, NOW);
    check("C4 a sandbox transaction is refused by a production deployment", !parsed.ok && parsed.reason === "WRONG_ENVIRONMENT", parsed);
  }
  {
    const parsed = await parseAppleSubscriptionResponse(await appleResponse({ bundleId: "com.attacker.app" }), applePseudoProd, NOW);
    check("C5 a transaction for another app is refused", !parsed.ok && parsed.reason === "WRONG_ENVIRONMENT", parsed);
  }
  {
    const parsed = await parseAppleSubscriptionResponse(await appleResponse({ productId: "com.attacker.free" }), applePseudoProd, NOW);
    check("C6 an unknown production product is refused", !parsed.ok && parsed.reason === "UNKNOWN_PRODUCT", parsed);
  }
  {
    const parsed = await parseAppleSubscriptionResponse(await appleResponse({ status: 5 }), applePseudoProd, NOW);
    check("C7 a revoked production purchase revokes access", parsed.ok && parsed.snapshot.lifecycle.revoke === true, parsed);
  }
  {
    const parsed = await parseAppleSubscriptionResponse(await appleResponse({ status: 4 }), applePseudoProd, NOW);
    check("C8 a production billing-grace purchase keeps access as past_due", parsed.ok && parsed.snapshot.lifecycle.status === "past_due", parsed);
  }
  {
    const parsed = await parseAppleSubscriptionResponse(await appleResponse({ revocationDate: NOW - 1000 }), applePseudoProd, NOW);
    check("C9 a refunded production purchase revokes access", parsed.ok && parsed.snapshot.lifecycle.revoke === true && parsed.snapshot.lifecycle.reason === "api_revoked", parsed);
  }
  {
    const parsed = await parseAppleSubscriptionResponse({ data: [] }, applePseudoProd, NOW);
    check("C10 a malformed production response is refused", !parsed.ok && parsed.reason === "MALFORMED_RESPONSE", parsed);
  }
  for (const [status, expected] of [
    [401, "UNAUTHORIZED"],
    [404, "NOT_FOUND"],
    [429, "RATE_LIMITED"],
    [500, "UPSTREAM_ERROR"],
  ] as const) {
    const result = await fetchAppleSubscriptionState("2000000900000001", {
      config: applePseudoProd,
      fetchImpl: stubFetch(status, {}),
      now: NOW,
    });
    check(`C11 an Apple ${status} response is a refusal (${expected})`, !result.ok && result.reason === expected, result);
  }
  {
    const result = await fetchAppleSubscriptionState("../../etc/passwd", { config: applePseudoProd, fetchImpl: stubFetch(200, {}), now: NOW });
    check("C12 a malformed transaction id never reaches the store", !result.ok && result.reason === "NOT_FOUND", result);
  }

  {
    const parsed = parseGoogleSubscriptionResponse(googleResponse(), "prod-token", googlePseudoProd);
    check("C13 a production Play purchase verifies", parsed.ok && parsed.snapshot.environment === "production" && parsed.snapshot.lifecycle.status === "active", parsed);
  }
  {
    const parsed = parseGoogleSubscriptionResponse(googleResponse({ testPurchase: {} }), "t", googlePseudoProd);
    check("C14 a Play test purchase is refused in production", !parsed.ok && parsed.reason === "WRONG_ENVIRONMENT", parsed);
  }
  {
    const parsed = parseGoogleSubscriptionResponse(
      googleResponse({ subscriptionState: "SUBSCRIPTION_STATE_EXPIRED", revoked: true }),
      "t",
      googlePseudoProd,
    );
    check("C15 a revoked Play purchase revokes access", parsed.ok && parsed.snapshot.lifecycle.revoke === true, parsed);
  }
  {
    const parsed = parseGoogleSubscriptionResponse(
      googleResponse({ lineItems: [{ productId: GOOGLE_PRODUCT, autoRenewingPlan: { autoRenewEnabled: false } }] }),
      "t",
      googlePseudoProd,
    );
    check("C16 auto-renew off keeps production access until period end", parsed.ok && parsed.snapshot.lifecycle.cancelAtPeriodEnd === true && parsed.snapshot.lifecycle.revoke === false, parsed);
  }
  {
    const parsed = parseGoogleSubscriptionResponse(googleResponse({ lineItems: [{ productId: "attacker.free" }] }), "t", googlePseudoProd);
    check("C17 an unknown Play product is refused in production", !parsed.ok && parsed.reason === "UNKNOWN_PRODUCT", parsed);
  }
  {
    const result = await fetchGoogleSubscriptionState("prod-token", {
      config: googlePseudoProd,
      accessToken: "stub",
      fetchImpl: stubFetch(403, {}),
    });
    check("C18 a denied Play read is never treated as valid", !result.ok && result.reason === "UNAUTHORIZED", result);
  }
  {
    let requested = "";
    const spy = (async (input: RequestInfo | URL) => {
      requested = String(input);
      return new Response(JSON.stringify(googleResponse()), { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    const result = await fetchGoogleSubscriptionState("prod-token", { config: googlePseudoProd, accessToken: "stub", fetchImpl: spy });
    check("C19 the production Play read is scoped to the production package", result.ok && requested.includes("com.lyve.app/purchases/subscriptionsv2/tokens/prod-token"), requested);
  }
  {
    const token = await signJws({ x: 1 });
    const verified = await verifyAppleJws(token, {});
    check("C20 without an override, Apple JWS must chain to the pinned Apple root", !verified.ok, verified);
  }

  /* ============ D. Lifecycle, ownership and ordering (database) ============ */

  const alice = await createMember("alice");
  const bob = await createMember("bob");
  const appleRef = `p6c-apple-${stamp}`;

  const link = await admin.rpc("billing_link_store_purchase", linkArgs(alice.id, appleRef) as never);
  check("D1 a verified production purchase binds to the purchasing account", String(link.data) === "linked", link);

  const relink = await admin.rpc("billing_link_store_purchase", linkArgs(alice.id, appleRef) as never);
  check("D2 re-presenting the same purchase is idempotent", String(relink.data) === "already_linked", relink);

  const transfer = await admin.rpc("billing_link_store_purchase", linkArgs(bob.id, appleRef) as never);
  check("D3 the purchase cannot be transferred to another account", String(transfer.data) === "owned_by_other", transfer);

  const renewal = await applyEvent({ store: "apple", eventId: `${appleRef}-renew-1`, eventAt: new Date(NOW).toISOString(), purchaseRef: appleRef, status: "active", reason: "DID_RENEW" });
  check("D4 a renewal is applied", renewal === "applied", renewal);
  check("D5 renewal grants Premium to the owner", await isPremium(alice));
  check("D6 renewal grants nothing to any other account", !(await isPremium(bob)));

  const duplicate = await applyEvent({ store: "apple", eventId: `${appleRef}-renew-1`, eventAt: new Date(NOW).toISOString(), purchaseRef: appleRef, status: "active", reason: "DID_RENEW" });
  check("D7 a replayed production event is ignored", duplicate === "duplicate", duplicate);

  const stale = await applyEvent({ store: "apple", eventId: `${appleRef}-stale`, eventAt: new Date(NOW - 3_600_000).toISOString(), purchaseRef: appleRef, status: "expired", reason: "EXPIRED" });
  check("D8 an out-of-order event cannot downgrade a newer state", stale === "stale", stale);
  check("D9 Premium survives the out-of-order event", await isPremium(alice));

  const cancel = await applyEvent({ store: "apple", eventId: `${appleRef}-cancel`, eventAt: new Date(NOW + 1000).toISOString(), purchaseRef: appleRef, status: "canceled", cancelAtPeriodEnd: true, reason: "DID_CHANGE_RENEWAL_STATUS:AUTO_RENEW_DISABLED" });
  check("D10 a cancellation is applied", cancel === "applied", cancel);
  check("D11 cancellation keeps access until the period ends", await isPremium(alice));

  const expire = await applyEvent({ store: "apple", eventId: `${appleRef}-expire`, eventAt: new Date(NOW + 2000).toISOString(), purchaseRef: appleRef, status: "expired", periodEnd: new Date(NOW - 1000).toISOString(), reason: "EXPIRED" });
  check("D12 an expiry is applied", expire === "applied", expire);
  check("D13 an expired subscription loses Premium", !(await isPremium(alice)));

  const resubscribe = await applyEvent({ store: "apple", eventId: `${appleRef}-resub`, eventAt: new Date(NOW + 3000).toISOString(), purchaseRef: appleRef, status: "active", reason: "SUBSCRIBED" });
  check("D14 a resubscription restores Premium to the same owner", resubscribe === "applied" && (await isPremium(alice)));

  const refund = await applyEvent({ store: "apple", eventId: `${appleRef}-refund`, eventAt: new Date(NOW + 4000).toISOString(), purchaseRef: appleRef, status: "expired", revoke: true, reason: "REFUND" });
  check("D15 a refund is applied", refund === "applied", refund);
  check("D16 a refund revokes Premium immediately", !(await isPremium(alice)));

  const postRefundTransfer = await admin.rpc("billing_link_store_purchase", linkArgs(bob.id, appleRef) as never);
  check("D17 a refunded purchase still cannot be claimed by another account", String(postRefundTransfer.data) === "owned_by_other", postRefundTransfer);

  const unlinked = await applyEvent({ store: "google", eventId: `p6c-orphan-${stamp}`, eventAt: new Date().toISOString(), purchaseRef: `p6c-unknown-${stamp}`, status: "active", reason: "RENEW" });
  check("D18 an event for an unlinked purchase grants nobody access", unlinked === "unlinked", unlinked);

  /* ============ E. Production reconciliation ============ */

  const snapshot = {
    store: "apple" as const,
    purchaseRef: appleRef,
    productId: APPLE_PRODUCT,
    environment: "production" as const,
    periodStart: new Date(NOW).toISOString(),
    periodEnd: new Date(NOW + 29 * 86_400_000).toISOString(),
    lifecycle: { status: "active" as const, revoke: false, cancelAtPeriodEnd: false, reason: "api_active" },
    stateToken: "1:api_active:x",
  };
  const first = snapshotToEvent(snapshot);
  const second = snapshotToEvent(snapshot);
  check("E1 unchanged production state reconciles to the same event id", first!.eventId === second!.eventId);
  check("E2 changed production state reconciles to a new event id", reconciliationEventId({ ...snapshot, stateToken: "2:api_expired:y" }) !== first!.eventId);
  check("E3 reconciliation event ids carry no purchase token", !first!.eventId.includes(appleRef));

  const recon1 = await applyEvent({ store: "apple", eventId: first!.eventId, eventAt: new Date(NOW + 5000).toISOString(), purchaseRef: appleRef, status: "active", reason: "reconciliation" });
  const recon2 = await applyEvent({ store: "apple", eventId: second!.eventId, eventAt: new Date(NOW + 6000).toISOString(), purchaseRef: appleRef, status: "active", reason: "reconciliation" });
  check("E4 a reconciliation pass applies once", recon1 === "applied", recon1);
  check("E5 re-running reconciliation changes nothing", recon2 === "duplicate", recon2);
  check("E6 reconciliation restores access to the rightful owner only", (await isPremium(alice)) && !(await isPremium(bob)));

  /* ============ F. Rate limiting, monitoring, redaction ============ */

  check("F1 production webhooks stay rate limited", RATE_LIMITS.webhook.limit > 0 && RATE_LIMITS.webhook.windowSeconds > 0);
  check("F2 signature failures are limited more tightly than traffic", RATE_LIMITS.webhookFailure.limit < RATE_LIMITS.webhook.limit);
  check("F3 account linking is the tightest surface", RATE_LIMITS.link.limit < RATE_LIMITS.webhookFailure.limit);

  const digest = refDigest("prod-purchase-token-abc");
  check("F4 purchase tokens are recorded only as a short digest", digest.length === 16 && !digest.includes("prod"));
  check("F5 the digest is stable", digest === refDigest("prod-purchase-token-abc"));

  const sanitized = sanitizeDetails({
    receipt: "SECRET-RECEIPT",
    purchaseToken: "SECRET-TOKEN",
    authorization: "Bearer SECRET",
    signedPayload: "SECRET",
    APPLE_IAP_PRIVATE_KEY: "SECRET",
    store: "apple",
    reason: "INVALID_SIGNATURE",
  });
  const serialized = JSON.stringify(sanitized);
  check("F6 monitoring drops receipts, tokens, payloads and credentials", !serialized.includes("SECRET"), serialized);
  check("F7 monitoring keeps the operational fields it needs", serialized.includes("apple") && serialized.includes("INVALID_SIGNATURE"));

  const { error: alertRead } = await createClient(url, publishableKey, { auth: { persistSession: false } })
    .from("store_alerts")
    .select("id")
    .limit(1);
  check("F8 visitors cannot read the production alert stream", Boolean(alertRead));

  const { error: memberAlertRead } = await alice.client.from("store_alerts").select("id").limit(1);
  check("F9 members cannot read the alert stream", Boolean(memberAlertRead));

  const { error: memberLedgerRead } = await alice.client.from("billing_events").select("id").limit(1);
  check("F10 members cannot read the billing event ledger", Boolean(memberLedgerRead));

  /* ============ G. Launch posture ============ */

  check("G1 this deployment is NOT running production purchases", storeMode() !== "production", storeMode());
  check("G2 no Apple production credentials are connected", !process.env["APPLE_IAP_PRIVATE_KEY"]);
  check("G3 no Google production service account is connected", !process.env["GOOGLE_PLAY_SERVICE_ACCOUNT_JSON"]);
  check("G4 the deployment declares the sandbox environment", configuredStoreEnvironment() === "sandbox");
  check("G5 the sandbox secret is still long enough to be meaningful", (storeSecret()?.length ?? 0) >= 16);

  await cleanup();

  console.log(`\nPhase 6C production readiness: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch(async (error) => {
  console.error(error);
  await cleanup();
  process.exit(1);
});
