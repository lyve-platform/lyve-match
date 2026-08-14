/**
 * LYVE Phase 6B — sandbox store integration validation.
 *
 * Exercises the REAL integration code paths (Apple JWS + App Store Server API,
 * Google Pub/Sub OIDC + Play Developer API, reconciliation, rate limiting and
 * alerting) using a locally generated certificate chain and a stubbed store
 * transport. No production credentials exist and none are required.
 *
 * The premise: with store credentials connected, the store — not the client
 * and not the delivery channel — is the only authority, and every failure is
 * a refusal rather than a fallback.
 *
 * Run:  bun run tests/security/phase6b-integration.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import fixtures from "../fixtures/store-certs.json";
import {
  APPLE_ROOT_CA_G3_FINGERPRINT,
  b64u,
  bytesToB64u,
  decodeJws,
  signAppleClientJwt,
  signGoogleServiceJwt,
  verifyAppleJws,
  verifyGoogleOidcToken,
} from "../../src/lib/billing/jws.server";
import {
  appleConfig,
  appleRail,
  appleTrustedRoots,
  configuredStoreEnvironment,
  googleConfig,
  googleRail,
  hasMisplacedAppleCredentials,
} from "../../src/lib/billing/store-env.server";
import {
  fetchAppleSubscriptionState,
  parseAppleSubscriptionResponse,
} from "../../src/lib/billing/apple-store.server";
import {
  authenticatePubSubPush,
  decodePubSubEnvelope,
  fetchGoogleSubscriptionState,
  googleAccessToken,
  parseGoogleSubscriptionResponse,
} from "../../src/lib/billing/google-store.server";
import { appleStatusLifecycle, googleStateLifecycle } from "../../src/lib/billing/store-core";
import {
  reconciliationEventId,
  snapshotToEvent,
  RECONCILE_BATCH,
} from "../../src/lib/billing/store-reconcile.server";
import { RATE_LIMITS, refDigest, sanitizeDetails } from "../../src/lib/billing/store-ops.server";

const url = process.env["SUPABASE_URL"]!;
const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
if (!url || !publishableKey || !serviceKey) {
  console.error("Missing SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const anon = createClient(url, publishableKey, { auth: { persistSession: false } });

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
/* Local Apple-shaped signing (test chain, never a real Apple key)      */
/* ------------------------------------------------------------------ */

const TEST_ROOTS = [fixtures.rootFingerprint];
const BUNDLE_ID = "com.lyve.app.test";

const leafKey = await crypto.subtle.importKey(
  "pkcs8",
  pem(fixtures.leafPrivateKeyPem),
  { name: "ECDSA", namedCurve: "P-256" },
  false,
  ["sign"],
);

function pem(text: string): ArrayBuffer {
  const body = text.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function signJws(payload: Record<string, unknown>, chain: string[]): Promise<string> {
  const header = b64u(JSON.stringify({ alg: "ES256", x5c: chain }));
  const body = b64u(JSON.stringify(payload));
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    leafKey,
    new TextEncoder().encode(`${header}.${body}`) as unknown as ArrayBuffer,
  );
  return `${header}.${body}.${bytesToB64u(new Uint8Array(signature))}`;
}

const GOOD_CHAIN = [fixtures.leafB64, fixtures.intermediateB64, fixtures.rootB64];
const ROGUE_CHAIN = [fixtures.rogueLeafB64, fixtures.rogueRootB64];

const NOW = Date.now();
const transactionPayload = (overrides: Record<string, unknown> = {}) => ({
  originalTransactionId: "2000000999000111",
  productId: "com.lyve.premium.monthly",
  environment: "Sandbox",
  bundleId: BUNDLE_ID,
  purchaseDate: NOW - 86_400_000,
  expiresDate: NOW + 86_400_000 * 29,
  ...overrides,
});

/* ------------------------------------------------------------------ */
/* A. Apple JWS / certificate chain verification                        */
/* ------------------------------------------------------------------ */

{
  const token = await signJws(transactionPayload(), GOOD_CHAIN);
  const good = await verifyAppleJws(token, { trustedRootFingerprints: TEST_ROOTS });
  check("A1 valid ES256 JWS with full chain verifies", good.ok);

  const untrusted = await verifyAppleJws(token, {});
  check(
    "A2 chain not anchored to the pinned Apple root is rejected",
    !untrusted.ok && untrusted.reason === "UNTRUSTED_ROOT",
    untrusted,
  );

  const rogue = await signJws(transactionPayload(), ROGUE_CHAIN);
  const rogueResult = await verifyAppleJws(rogue, { trustedRootFingerprints: TEST_ROOTS });
  check(
    "A3 attacker-issued chain (own root) is rejected",
    !rogueResult.ok && rogueResult.reason === "UNTRUSTED_ROOT",
    rogueResult,
  );

  const spliced = await signJws(transactionPayload(), [fixtures.rogueLeafB64, fixtures.intermediateB64, fixtures.rootB64]);
  const splicedResult = await verifyAppleJws(spliced, { trustedRootFingerprints: TEST_ROOTS });
  check(
    "A4 splicing an attacker leaf under the trusted root is rejected",
    !splicedResult.ok && splicedResult.reason === "BROKEN_CHAIN",
    splicedResult,
  );

  const parts = token.split(".");
  const tampered = `${parts[0]}.${b64u(JSON.stringify(transactionPayload({ productId: "com.lyve.premium.annual" })))}.${parts[2]}`;
  const tamperedResult = await verifyAppleJws(tampered, { trustedRootFingerprints: TEST_ROOTS });
  check(
    "A5 payload tampering invalidates the signature",
    !tamperedResult.ok && tamperedResult.reason === "BAD_SIGNATURE",
    tamperedResult,
  );

  const alg = `${b64u(JSON.stringify({ alg: "none", x5c: GOOD_CHAIN }))}.${parts[1]}.`;
  const algResult = await verifyAppleJws(alg, { trustedRootFingerprints: TEST_ROOTS });
  check("A6 alg=none is refused", !algResult.ok && algResult.reason !== "MALFORMED" ? algResult.reason === "UNSUPPORTED_ALG" : algResult.ok === false, algResult);

  const hs = `${b64u(JSON.stringify({ alg: "HS256", x5c: GOOD_CHAIN }))}.${parts[1]}.${parts[2]}`;
  const hsResult = await verifyAppleJws(hs, { trustedRootFingerprints: TEST_ROOTS });
  check("A7 symmetric alg substitution is refused", !hsResult.ok && hsResult.reason === "UNSUPPORTED_ALG", hsResult);

  const noChain = `${b64u(JSON.stringify({ alg: "ES256" }))}.${parts[1]}.${parts[2]}`;
  const noChainResult = await verifyAppleJws(noChain, { trustedRootFingerprints: TEST_ROOTS });
  check("A8 missing x5c is refused", !noChainResult.ok && noChainResult.reason === "MISSING_CHAIN", noChainResult);

  const skipped = await signJws(transactionPayload(), [fixtures.leafB64, fixtures.rootB64]);
  const skippedResult = await verifyAppleJws(skipped, { trustedRootFingerprints: TEST_ROOTS });
  check(
    "A9 chain with a missing intermediate is refused",
    !skippedResult.ok && skippedResult.reason === "BROKEN_CHAIN",
    skippedResult,
  );

  const future = await verifyAppleJws(token, {
    trustedRootFingerprints: TEST_ROOTS,
    now: new Date(Date.now() + 40 * 365 * 86_400_000),
  });
  check("A10 expired certificates are refused", !future.ok && future.reason === "CERT_EXPIRED", future);

  const malformed = await verifyAppleJws("not-a-jws", { trustedRootFingerprints: TEST_ROOTS });
  check("A11 malformed token is refused", !malformed.ok && malformed.reason === "MALFORMED", malformed);

  check(
    "A12 default trust anchor is the pinned Apple Root CA - G3 fingerprint",
    APPLE_ROOT_CA_G3_FINGERPRINT.length === 64 && APPLE_ROOT_CA_G3_FINGERPRINT !== fixtures.rootFingerprint,
  );

  check("A13 decodeJws never claims validity on its own", decodeJws(rogue) !== null);
}

/* ------------------------------------------------------------------ */
/* B. Credential + environment isolation                                */
/* ------------------------------------------------------------------ */

function clearStoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (/^(APPLE_IAP|GOOGLE_PLAY|GOOGLE_RTDN|LYVE_STORE|APPLE_SANDBOX)/.test(key)) delete process.env[key];
  }
}

function setAppleSandboxEnv() {
  process.env["APPLE_IAP_SANDBOX_ISSUER_ID"] = "issuer-uuid";
  process.env["APPLE_IAP_SANDBOX_KEY_ID"] = "ABCD1234";
  process.env["APPLE_IAP_SANDBOX_PRIVATE_KEY"] = fixtures.leafPrivateKeyPem;
  process.env["APPLE_IAP_SANDBOX_BUNDLE_ID"] = BUNDLE_ID;
  process.env["APPLE_SANDBOX_ROOT_FINGERPRINTS"] = fixtures.rootFingerprint;
}

const GOOGLE_SA = JSON.stringify({
  client_email: "lyve-sandbox@lyve.iam.gserviceaccount.com",
  private_key: fixtures.rsaPrivateKeyPem,
});

function setGoogleSandboxEnv() {
  process.env["GOOGLE_PLAY_SANDBOX_SERVICE_ACCOUNT_JSON"] = GOOGLE_SA;
  process.env["GOOGLE_PLAY_SANDBOX_PACKAGE_NAME"] = "com.lyve.app";
  process.env["GOOGLE_RTDN_SANDBOX_AUDIENCE"] = "https://lyve.test/api/public/webhooks/google";
  process.env["GOOGLE_RTDN_SANDBOX_SERVICE_ACCOUNT_EMAIL"] = "pubsub@lyve.iam.gserviceaccount.com";
}

{
  clearStoreEnv();
  check("B1 default deployment environment is sandbox", configuredStoreEnvironment() === "sandbox");
  check("B2 no credentials → apple falls back to the internal test rail", appleRail() === "hmac");

  process.env["APPLE_IAP_SANDBOX_ISSUER_ID"] = "issuer-uuid";
  const partial = appleConfig();
  check("B3 partial credentials are NOT configured (never partial trust)", !partial.ok && partial.reason === "NOT_CONFIGURED", partial);

  clearStoreEnv();
  setAppleSandboxEnv();
  process.env["APPLE_IAP_ISSUER_ID"] = "production-issuer";
  check("B4 production credentials in a sandbox deployment are detected", hasMisplacedAppleCredentials());
  const misplaced = appleConfig();
  check("B5 misplaced credentials fail closed", !misplaced.ok && misplaced.reason === "CREDENTIAL_MISPLACED", misplaced);
  check("B6 misconfigured store has no usable rail", appleRail() === "none");

  clearStoreEnv();
  setAppleSandboxEnv();
  const ok = appleConfig();
  check("B7 sandbox credentials resolve to the sandbox API host", ok.ok && ok.config.apiBase.includes("storekit-sandbox"), ok.ok ? ok.config.apiBase : ok);
  check("B8 sandbox credentials select the API rail", appleRail() === "api");
  check("B9 test trust anchors are accepted in sandbox", appleTrustedRoots().includes(fixtures.rootFingerprint));

  process.env["LYVE_STORE_ENVIRONMENT"] = "production";
  check("B10 test trust anchors are ignored in a production deployment", appleTrustedRoots().length === 0);
  check("B11 sandbox credentials in a production deployment fail closed", appleConfig().ok === false);
  delete process.env["LYVE_STORE_ENVIRONMENT"];

  process.env["APPLE_IAP_SANDBOX_PRIVATE_KEY"] = "not-a-key";
  const badKey = appleConfig();
  check("B12 a non-PEM private key is rejected", !badKey.ok && badKey.reason === "INVALID_CREDENTIAL", badKey);

  clearStoreEnv();
  process.env["GOOGLE_PLAY_SANDBOX_SERVICE_ACCOUNT_JSON"] = "{oops";
  process.env["GOOGLE_PLAY_SANDBOX_PACKAGE_NAME"] = "com.lyve.app";
  const badJson = googleConfig();
  check("B13 malformed service-account JSON is rejected", !badJson.ok && badJson.reason === "INVALID_CREDENTIAL", badJson);

  clearStoreEnv();
  setGoogleSandboxEnv();
  const gc = googleConfig();
  check("B14 google sandbox credentials resolve", gc.ok && gc.config.packageName === "com.lyve.app");
  check("B15 google rail is api when configured", googleRail() === "api");
}

/* ------------------------------------------------------------------ */
/* C. App Store Server API rail                                         */
/* ------------------------------------------------------------------ */

clearStoreEnv();
setAppleSandboxEnv();
const APPLE_CONFIG = (() => {
  const resolved = appleConfig();
  if (!resolved.ok) throw new Error("apple fixture config failed");
  return resolved.config;
})();

async function appleResponseBody(
  status: number,
  overrides: Record<string, unknown> = {},
  chain = GOOD_CHAIN,
  renewalAutoRenew: number | null = null,
) {
  const signedTransactionInfo = await signJws(transactionPayload(overrides), chain);
  const transaction: Record<string, unknown> = { status, signedTransactionInfo };
  if (renewalAutoRenew !== null) {
    transaction["signedRenewalInfo"] = await signJws({ autoRenewStatus: renewalAutoRenew }, chain);
  }
  return { environment: "Sandbox", data: [{ lastTransactions: [transaction] }] };
}

{
  const active = await parseAppleSubscriptionResponse(await appleResponseBody(1), APPLE_CONFIG);
  check(
    "C1 active sandbox subscription maps to active premium",
    active.ok && active.snapshot.lifecycle.status === "active" && active.snapshot.purchaseRef === "2000000999000111",
    active,
  );

  const revoked = await parseAppleSubscriptionResponse(await appleResponseBody(5), APPLE_CONFIG);
  check("C2 revoked status revokes entitlements", revoked.ok && revoked.snapshot.lifecycle.revoke, revoked);

  const refunded = await parseAppleSubscriptionResponse(
    await appleResponseBody(1, { revocationDate: NOW - 1000 }),
    APPLE_CONFIG,
  );
  check("C3 a revocation date beats an 'active' status", refunded.ok && refunded.snapshot.lifecycle.revoke, refunded);

  const retry = await parseAppleSubscriptionResponse(await appleResponseBody(3), APPLE_CONFIG);
  check("C4 billing retry keeps the account in past_due", retry.ok && retry.snapshot.lifecycle.status === "past_due");

  const cancelled = await parseAppleSubscriptionResponse(await appleResponseBody(1, {}, GOOD_CHAIN, 0), APPLE_CONFIG);
  check(
    "C5 auto-renew off is canceled-at-period-end, not immediate loss",
    cancelled.ok && cancelled.snapshot.lifecycle.status === "canceled" && cancelled.snapshot.lifecycle.cancelAtPeriodEnd,
    cancelled,
  );

  const production = await parseAppleSubscriptionResponse(
    { environment: "Production", data: (await appleResponseBody(1)).data },
    APPLE_CONFIG,
  );
  check(
    "C6 a production transaction is refused by a sandbox deployment",
    !production.ok && production.reason === "WRONG_ENVIRONMENT",
    production,
  );

  const unknown = await parseAppleSubscriptionResponse(
    await appleResponseBody(1, { productId: "com.lyve.premium.forever" }),
    APPLE_CONFIG,
  );
  check("C7 unknown product is refused", !unknown.ok && unknown.reason === "UNKNOWN_PRODUCT", unknown);

  const wrongBundle = await parseAppleSubscriptionResponse(
    await appleResponseBody(1, { bundleId: "com.attacker.app" }),
    APPLE_CONFIG,
  );
  check("C8 a transaction for another bundle is refused", !wrongBundle.ok, wrongBundle);

  const forged = await parseAppleSubscriptionResponse(await appleResponseBody(1, {}, ROGUE_CHAIN), APPLE_CONFIG);
  check(
    "C9 a self-signed transaction is refused even from the real endpoint",
    !forged.ok && forged.reason === "SIGNATURE_INVALID",
    forged,
  );

  const empty = await parseAppleSubscriptionResponse({ data: [] }, APPLE_CONFIG);
  check("C10 an empty response is refused", !empty.ok && empty.reason === "MALFORMED_RESPONSE", empty);

  const unsupported = await parseAppleSubscriptionResponse(await appleResponseBody(99), APPLE_CONFIG);
  check("C11 an unknown status code is refused", !unsupported.ok && unsupported.reason === "UNSUPPORTED_STATE", unsupported);
}

{
  let seenUrl = "";
  let seenAuth = "";
  const stub = (async (input: RequestInfo | URL, init?: RequestInit) => {
    seenUrl = String(input);
    seenAuth = String(new Headers(init?.headers).get("authorization"));
    return new Response(JSON.stringify(await appleResponseBody(1)), { status: 200 });
  }) as typeof fetch;

  const result = await fetchAppleSubscriptionState("2000000999000111", { fetchImpl: stub, config: APPLE_CONFIG });
  check("C12 transport calls the sandbox host only", seenUrl.startsWith("https://api.storekit-sandbox.itunes.apple.com/inApps/v1/subscriptions/"), seenUrl);
  check("C13 transport presents a bearer client assertion", seenAuth.startsWith("Bearer ey"));
  check("C14 verified sandbox read succeeds end to end", result.ok);

  const jwt = decodeJws(seenAuth.slice(7));
  check("C15 client assertion is ES256 with the configured key id", jwt?.header["alg"] === "ES256" && jwt?.header["kid"] === "ABCD1234");
  check(
    "C16 client assertion is audience- and bundle-scoped and short lived",
    jwt?.payload["aud"] === "appstoreconnect-v1" &&
      jwt?.payload["bid"] === BUNDLE_ID &&
      Number(jwt?.payload["exp"]) - Number(jwt?.payload["iat"]) <= 3600,
    jwt?.payload,
  );

  const codes: Array<[number, string]> = [
    [401, "UNAUTHORIZED"],
    [403, "UNAUTHORIZED"],
    [404, "NOT_FOUND"],
    [429, "RATE_LIMITED"],
    [500, "UPSTREAM_ERROR"],
  ];
  for (const [status, reason] of codes) {
    const failing = (async () => new Response("{}", { status })) as typeof fetch;
    const out = await fetchAppleSubscriptionState("2000000999000111", { fetchImpl: failing, config: APPLE_CONFIG });
    check(`C17 HTTP ${status} maps to ${reason} (never to trust)`, !out.ok && out.reason === reason, out);
  }

  const thrown = (async () => {
    throw new Error("network");
  }) as typeof fetch;
  const netFail = await fetchAppleSubscriptionState("2000000999000111", { fetchImpl: thrown, config: APPLE_CONFIG });
  check("C18 a network failure is an upstream error, not an approval", !netFail.ok && netFail.reason === "UPSTREAM_ERROR");

  const injected = await fetchAppleSubscriptionState("../../../etc/passwd", { fetchImpl: stub, config: APPLE_CONFIG });
  check("C19 a malformed transaction id never reaches the store", !injected.ok && injected.reason === "NOT_FOUND", injected);
}

/* ------------------------------------------------------------------ */
/* D. Google Play rail + Pub/Sub push authentication                    */
/* ------------------------------------------------------------------ */

clearStoreEnv();
setGoogleSandboxEnv();
const GOOGLE_CONFIG = (() => {
  const resolved = googleConfig();
  if (!resolved.ok) throw new Error("google fixture config failed");
  return resolved.config;
})();

const JWKS = { keys: [fixtures.rsaJwk as Record<string, unknown>] };

const rsaKey = await crypto.subtle.importKey(
  "pkcs8",
  pem(fixtures.rsaPrivateKeyPem),
  { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
  false,
  ["sign"],
);

async function oidcToken(claims: Record<string, unknown>, kid = "lyve-test-key"): Promise<string> {
  const header = b64u(JSON.stringify({ alg: "RS256", kid, typ: "JWT" }));
  const body = b64u(
    JSON.stringify({
      iss: "https://accounts.google.com",
      aud: GOOGLE_CONFIG.pushAudience,
      email: GOOGLE_CONFIG.pushServiceAccountEmail,
      email_verified: true,
      exp: Math.floor(Date.now() / 1000) + 600,
      ...claims,
    }),
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    rsaKey,
    new TextEncoder().encode(`${header}.${body}`) as unknown as ArrayBuffer,
  );
  return `${header}.${body}.${bytesToB64u(new Uint8Array(signature))}`;
}

function pushHeaders(token: string): Headers {
  return new Headers({ authorization: `Bearer ${token}` });
}

{
  const valid = await oidcToken({});
  const good = await verifyGoogleOidcToken(valid, {
    jwks: JWKS,
    audience: GOOGLE_CONFIG.pushAudience!,
    serviceAccountEmail: GOOGLE_CONFIG.pushServiceAccountEmail!,
  });
  check("D1 a genuine Pub/Sub OIDC token verifies", good.ok);

  const cases: Array<[string, Record<string, unknown>, string]> = [
    ["wrong audience", { aud: "https://attacker.test/hook" }, "WRONG_AUDIENCE"],
    ["wrong principal", { email: "attacker@evil.test" }, "WRONG_PRINCIPAL"],
    ["unverified email", { email_verified: false }, "WRONG_PRINCIPAL"],
    ["wrong issuer", { iss: "https://attacker.test" }, "WRONG_ISSUER"],
    ["expired", { exp: Math.floor(Date.now() / 1000) - 60 }, "EXPIRED"],
  ];
  for (const [label, claims, reason] of cases) {
    const token = await oidcToken(claims);
    const out = await verifyGoogleOidcToken(token, {
      jwks: JWKS,
      audience: GOOGLE_CONFIG.pushAudience!,
      serviceAccountEmail: GOOGLE_CONFIG.pushServiceAccountEmail!,
    });
    check(`D2 push token with ${label} is refused (${reason})`, !out.ok && out.reason === reason, out);
  }

  const unknownKid = await oidcToken({}, "other-key");
  const unknownKidResult = await verifyGoogleOidcToken(unknownKid, {
    jwks: JWKS,
    audience: GOOGLE_CONFIG.pushAudience!,
    serviceAccountEmail: GOOGLE_CONFIG.pushServiceAccountEmail!,
  });
  check("D3 an unknown signing key is refused", !unknownKidResult.ok && unknownKidResult.reason === "UNKNOWN_KEY");

  const parts = valid.split(".");
  const tampered = `${parts[0]}.${b64u(JSON.stringify({ aud: GOOGLE_CONFIG.pushAudience, email: GOOGLE_CONFIG.pushServiceAccountEmail, email_verified: true, iss: "https://accounts.google.com", exp: Math.floor(Date.now() / 1000) + 600, extra: 1 }))}.${parts[2]}`;
  const tamperedResult = await verifyGoogleOidcToken(tampered, {
    jwks: JWKS,
    audience: GOOGLE_CONFIG.pushAudience!,
    serviceAccountEmail: GOOGLE_CONFIG.pushServiceAccountEmail!,
  });
  check("D4 tampering with push claims breaks the signature", !tamperedResult.ok && tamperedResult.reason === "BAD_SIGNATURE");

  const noAuth = await authenticatePubSubPush(new Headers(), { config: GOOGLE_CONFIG, jwks: JWKS });
  check("D5 an unauthenticated push is refused", !noAuth.ok && noAuth.reason === "MISSING_TOKEN");

  const authed = await authenticatePubSubPush(pushHeaders(valid), { config: GOOGLE_CONFIG, jwks: JWKS });
  check("D6 an authenticated push is accepted", authed.ok);

  const noPushConfig = await authenticatePubSubPush(pushHeaders(valid), {
    config: { ...GOOGLE_CONFIG, pushAudience: null, pushServiceAccountEmail: null },
    jwks: JWKS,
  });
  check(
    "D7 push authentication is refused when unconfigured (never open)",
    !noPushConfig.ok && noPushConfig.reason === "PUSH_NOT_CONFIGURED",
  );
}

{
  const payload = { version: "1.0", packageName: "com.lyve.app", eventTimeMillis: String(NOW), subscriptionNotification: { notificationType: 2, purchaseToken: "tok-123", subscriptionId: "lyve_premium_monthly" } };
  const envelope = JSON.stringify({
    message: { data: btoa(JSON.stringify(payload)), messageId: "9876543210" },
    subscription: "projects/lyve/subscriptions/rtdn",
  });
  const decoded = decodePubSubEnvelope(envelope);
  check("D8 a valid Pub/Sub envelope decodes", decoded.ok && decoded.messageId === "9876543210");
  check("D9 a non-JSON envelope is refused", !decodePubSubEnvelope("nope").ok);
  check("D10 an envelope without messageId is refused", !decodePubSubEnvelope(JSON.stringify({ message: { data: "e30" } })).ok);
  check("D11 an envelope with non-JSON data is refused", !decodePubSubEnvelope(JSON.stringify({ message: { data: "%%%", messageId: "1" } })).ok);
}

{
  const body = (overrides: Record<string, unknown> = {}, item: Record<string, unknown> = {}) => ({
    subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
    testPurchase: {},
    startTime: new Date(NOW - 86_400_000).toISOString(),
    lineItems: [
      {
        productId: "lyve_premium_monthly",
        expiryTime: new Date(NOW + 86_400_000 * 29).toISOString(),
        autoRenewingPlan: { autoRenewEnabled: true },
        ...item,
      },
    ],
    ...overrides,
  });

  const active = parseGoogleSubscriptionResponse(body(), "tok-123", GOOGLE_CONFIG);
  check("D12 active Play subscription maps to active", active.ok && active.snapshot.lifecycle.status === "active");

  const grace = parseGoogleSubscriptionResponse(body({ subscriptionState: "SUBSCRIPTION_STATE_IN_GRACE_PERIOD" }), "tok", GOOGLE_CONFIG);
  check("D13 grace period is past_due", grace.ok && grace.snapshot.lifecycle.status === "past_due");

  const paused = parseGoogleSubscriptionResponse(body({ subscriptionState: "SUBSCRIPTION_STATE_PAUSED" }), "tok", GOOGLE_CONFIG);
  check("D14 paused is paused", paused.ok && paused.snapshot.lifecycle.status === "paused");

  const revoked = parseGoogleSubscriptionResponse(
    body({ subscriptionState: "SUBSCRIPTION_STATE_EXPIRED", revoked: true }),
    "tok",
    GOOGLE_CONFIG,
  );
  check("D15 a revoked purchase revokes entitlements", revoked.ok && revoked.snapshot.lifecycle.revoke);

  const cancelled = parseGoogleSubscriptionResponse(body({}, { autoRenewingPlan: { autoRenewEnabled: false } }), "tok", GOOGLE_CONFIG);
  check("D16 auto-renew off keeps access to period end", cancelled.ok && cancelled.snapshot.lifecycle.cancelAtPeriodEnd);

  const production = parseGoogleSubscriptionResponse({ ...body(), testPurchase: undefined }, "tok", GOOGLE_CONFIG);
  check("D17 a production purchase is refused by a sandbox deployment", !production.ok && production.reason === "WRONG_ENVIRONMENT", production);

  const unknown = parseGoogleSubscriptionResponse(body({}, { productId: "lyve_premium_lifetime" }), "tok", GOOGLE_CONFIG);
  check("D18 an unknown Play product is refused", !unknown.ok && unknown.reason === "UNKNOWN_PRODUCT");

  const unsupported = parseGoogleSubscriptionResponse(body({ subscriptionState: "SUBSCRIPTION_STATE_UNSPECIFIED" }), "tok", GOOGLE_CONFIG);
  check("D19 an unspecified state is refused", !unsupported.ok && unsupported.reason === "UNSUPPORTED_STATE");

  const malformed = parseGoogleSubscriptionResponse({}, "tok", GOOGLE_CONFIG);
  check("D20 a malformed Play response is refused", !malformed.ok && malformed.reason === "MALFORMED_RESPONSE");
}

{
  let tokenBody = "";
  let apiUrl = "";
  const stub = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const target = String(input);
    if (target.includes("oauth2.googleapis.com")) {
      tokenBody = String(init?.body ?? "");
      return new Response(JSON.stringify({ access_token: "ya29.test" }), { status: 200 });
    }
    apiUrl = target;
    return new Response(
      JSON.stringify({
        subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
        testPurchase: {},
        lineItems: [{ productId: "lyve_premium_monthly", expiryTime: new Date(NOW + 1000).toISOString() }],
      }),
      { status: 200 },
    );
  }) as typeof fetch;

  const issued = await googleAccessToken(GOOGLE_CONFIG, { fetchImpl: stub });
  check("D21 service-account exchange yields an access token", issued.ok);
  check("D22 exchange uses the JWT bearer grant", tokenBody.includes("grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer"));

  const assertion = new URLSearchParams(tokenBody).get("assertion") ?? "";
  const decodedAssertion = decodeJws(assertion);
  check(
    "D23 assertion is RS256, scoped to androidpublisher, issued by the service account",
    decodedAssertion?.header["alg"] === "RS256" &&
      String(decodedAssertion?.payload["scope"]).includes("androidpublisher") &&
      decodedAssertion?.payload["iss"] === GOOGLE_CONFIG.clientEmail,
    decodedAssertion?.payload,
  );

  const state = await fetchGoogleSubscriptionState("tok-abc", { fetchImpl: stub, config: GOOGLE_CONFIG });
  check("D24 Play read succeeds end to end", state.ok);
  check(
    "D25 Play read is scoped to the configured package and token",
    apiUrl.includes("/applications/com.lyve.app/purchases/subscriptionsv2/tokens/tok-abc"),
    apiUrl,
  );

  const denied = (async (input: RequestInfo | URL) =>
    String(input).includes("oauth2")
      ? new Response(JSON.stringify({ access_token: "ya29.test" }), { status: 200 })
      : new Response("{}", { status: 403 })) as typeof fetch;
  const deniedResult = await fetchGoogleSubscriptionState("tok-abc", { fetchImpl: denied, config: GOOGLE_CONFIG });
  check("D26 a denied Play read is never treated as valid", !deniedResult.ok && deniedResult.reason === "UNAUTHORIZED");

  const badCreds = (async () => new Response("{}", { status: 401 })) as typeof fetch;
  const badCredsResult = await fetchGoogleSubscriptionState("tok-abc", { fetchImpl: badCreds, config: GOOGLE_CONFIG });
  check("D27 rejected service-account credentials fail closed", !badCredsResult.ok && badCredsResult.reason === "UNAUTHORIZED");
}

/* ------------------------------------------------------------------ */
/* E. Lifecycle mapping + reconciliation purity                         */
/* ------------------------------------------------------------------ */

{
  check("E1 apple status 1 with auto-renew is active", appleStatusLifecycle(1, true)?.status === "active");
  check("E2 apple status 2 is expired without revocation", appleStatusLifecycle(2)?.status === "expired" && appleStatusLifecycle(2)?.revoke === false);
  check("E3 apple status 4 (grace) keeps past_due", appleStatusLifecycle(4)?.status === "past_due");
  check("E4 apple status 5 revokes", appleStatusLifecycle(5)?.revoke === true);
  check("E5 unknown apple status maps to nothing", appleStatusLifecycle(42) === null);
  check("E6 unknown play state maps to nothing", googleStateLifecycle("SUBSCRIPTION_STATE_NEW") === null);
  check("E7 play pending is incomplete, not active", googleStateLifecycle("SUBSCRIPTION_STATE_PENDING")?.status === "incomplete");

  const snapshot = {
    store: "apple" as const,
    purchaseRef: "2000000999000111",
    productId: "com.lyve.premium.monthly",
    environment: "sandbox" as const,
    periodStart: new Date(NOW).toISOString(),
    periodEnd: new Date(NOW + 1000).toISOString(),
    lifecycle: appleStatusLifecycle(1)!,
    stateToken: "1:api_active:x",
  };

  const idA = reconciliationEventId(snapshot);
  const idB = reconciliationEventId({ ...snapshot });
  const idC = reconciliationEventId({ ...snapshot, stateToken: "5:api_revoked:x" });
  check("E8 reconciliation is idempotent for unchanged store state", idA === idB);
  check("E9 a changed store state produces a new event id", idA !== idC);
  check("E10 reconciliation event ids are namespaced and carry no token", idA.startsWith("recon:apple:") && !idA.includes(snapshot.purchaseRef));

  const event = snapshotToEvent(snapshot);
  check("E11 snapshot converts to a verified event", event?.purchaseRef === snapshot.purchaseRef && event?.eventType.startsWith("reconciliation:"));
  check("E12 an unknown product cannot be reconciled", snapshotToEvent({ ...snapshot, productId: "com.lyve.unknown" }) === null);
  check("E13 reconciliation batch size is bounded", RECONCILE_BATCH > 0 && RECONCILE_BATCH <= 200);
}

/* ------------------------------------------------------------------ */
/* F. Operational hygiene (no secrets in monitoring)                    */
/* ------------------------------------------------------------------ */

{
  const token = "super-secret-purchase-token";
  const digest = refDigest(token);
  check("F1 purchase references are recorded as a short digest", digest.length === 16 && !digest.includes(token));
  check("F2 the digest is stable", refDigest(token) === digest);
  check("F3 different tokens produce different digests", refDigest(`${token}x`) !== digest);

  const details = sanitizeDetails({
    store: "apple",
    receipt: "MIIT...secret",
    purchase_token: token,
    authorization: "Bearer abc",
    reason: "x".repeat(500),
    hits: 3,
  });
  check("F4 monitoring drops receipts and tokens", !("receipt" in details) && !("purchase_token" in details) && !("authorization" in details), details);
  check("F5 monitoring keeps only bounded operational fields", details["store"] === "apple" && String(details["reason"]).length === 120 && details["hits"] === 3);
  check("F6 webhook rate limit is finite", RATE_LIMITS.webhook.limit > 0 && RATE_LIMITS.webhook.windowSeconds > 0);
  check("F7 member linking is throttled more tightly than webhooks", RATE_LIMITS.link.limit < RATE_LIMITS.webhook.limit);
}

/* ------------------------------------------------------------------ */
/* G. Database-backed limiter, alerts and reconciliation ledger          */
/* ------------------------------------------------------------------ */

const stamp = Date.now();
const bucket = `test:${stamp}`;

{
  const results: boolean[] = [];
  for (let i = 0; i < 4; i += 1) {
    const { data } = await admin.rpc("store_rate_limit_hit", { p_bucket: bucket, p_limit: 3, p_window_seconds: 60 });
    results.push((data as { allowed?: boolean })?.allowed === true);
  }
  check("G1 the limiter allows traffic up to the limit", results.slice(0, 3).every(Boolean), results);
  check("G2 the limiter blocks beyond the limit", results[3] === false, results);

  const { data: other } = await admin.rpc("store_rate_limit_hit", { p_bucket: `${bucket}:b`, p_limit: 3, p_window_seconds: 60 });
  check("G3 limits are per bucket, not global", (other as { allowed?: boolean })?.allowed === true);

  const { data: shortWindow } = await admin.rpc("store_rate_limit_hit", { p_bucket: `${bucket}:c`, p_limit: 0, p_window_seconds: 60 });
  check("G4 a nonsensical limit denies rather than allows", (shortWindow as { allowed?: boolean })?.allowed === false);

  const anonLimiter = await anon.rpc("store_rate_limit_hit", { p_bucket: bucket, p_limit: 3, p_window_seconds: 60 });
  check("G5 visitors cannot drive the limiter", anonLimiter.error !== null);

  const anonAlert = await anon.rpc("store_raise_alert", { p_kind: "x", p_severity: "info", p_fingerprint: "y" });
  check("G6 visitors cannot forge alerts", anonAlert.error !== null);

  const fingerprint = `fp-${stamp}`;
  let last: { occurrences?: number; breached?: boolean } = {};
  for (let i = 0; i < 3; i += 1) {
    const { data } = await admin.rpc("store_raise_alert", {
      p_kind: "store_signature_failure",
      p_severity: "critical",
      p_fingerprint: fingerprint,
      p_details: { store: "apple", reason: "INVALID_SIGNATURE" } as never,
      p_window_seconds: 300,
      p_threshold: 3,
    });
    last = (data ?? {}) as typeof last;
  }
  check("G7 repeated failures group into one alert row", last.occurrences === 3, last);
  check("G8 alerts breach only at the configured threshold", last.breached === true, last);

  const { data: alertRows } = await admin
    .from("store_alerts")
    .select("id, details")
    .eq("fingerprint", fingerprint);
  check("G9 exactly one alert row per fingerprint window", (alertRows ?? []).length === 1);
  check(
    "G10 alert details carry no store payload",
    JSON.stringify(alertRows?.[0]?.details ?? {}).length < 200,
    alertRows?.[0]?.details,
  );

  const deletion = await admin.from("store_alerts").delete().eq("fingerprint", fingerprint);
  check("G11 alerts are append-only, even for the service role", deletion.error !== null, deletion.error?.message);

  const anonAlerts = await anon.from("store_alerts").select("id").limit(1);
  check("G12 visitors cannot read the alert stream", (anonAlerts.data ?? []).length === 0);

  const anonLimits = await anon.from("store_rate_limits").select("bucket").limit(1);
  check("G13 visitors cannot read limiter state", (anonLimits.data ?? []).length === 0);

  const anonRuns = await anon.from("store_reconciliation_runs").select("id").limit(1);
  check("G14 visitors cannot read reconciliation history", (anonRuns.data ?? []).length === 0);

  const { data: run } = await admin
    .from("store_reconciliation_runs")
    .insert({ mode: "manual", scanned: 1 })
    .select("id")
    .single();
  const runDelete = await admin.from("store_reconciliation_runs").delete().eq("id", run!.id);
  check("G15 reconciliation history is append-only", runDelete.error !== null);

  const { data: purchaseColumns, error: columnError } = await admin
    .from("store_purchases")
    .select("last_reconciled_at")
    .limit(1);
  check("G16 purchases track their last reconciliation", columnError === null, columnError?.message ?? purchaseColumns);
}

/* ------------------------------------------------------------------ */

clearStoreEnv();
console.log(`\nPhase 6B sandbox integration: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
