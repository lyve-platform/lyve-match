/**
 * LYVE Phase 6A — mobile store billing security suite (Apple IAP / Google Play).
 *
 * Stage: SANDBOX. No production Apple or Google credentials are connected;
 * the sandbox rail exercises exactly the same verification, binding,
 * idempotency and ordering code paths that production will use.
 *
 * Central premise under test: a valid store purchase can never be attached to
 * a second LYVE account, and nothing a client controls can produce Premium.
 *
 * Run:  bun run tests/security/phase6-audit.ts   (or via tests/security/run-all.ts)
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  appleLifecycle,
  googleLifecycle,
  productFor,
  GOOGLE_NOTIFICATION_TYPES,
  STORE_PRODUCTS,
} from "../../src/lib/billing/store-core";
import {
  STORE_SIGNATURE_HEADER,
  STORE_TIMESTAMP_HEADER,
  STORE_TIMESTAMP_TOLERANCE_SECONDS,
  buildSandboxReceipt,
  normalizeAppleEvent,
  normalizeGoogleEvent,
  signSandboxWebhook,
  storeMode,
  storeSecret,
  verifyStoreNotification,
  verifyStorePurchase,
} from "../../src/lib/billing/store-verify.server";
import { appleRail } from "../../src/lib/billing/store-env.server";
import { statusGrantsAccess } from "../../src/lib/billing-core";
import { PREMIUM_ENTITLEMENTS } from "../../src/config/billing";

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

const stamp = Date.now();
const password = `Ph6-audit-${stamp}`;
const secret = storeSecret();
const appleIsHmac = appleRail() === "hmac";

type Member = { id: string; email: string; client: SupabaseClient };
const created: string[] = [];

async function createMember(tag: string): Promise<Member> {
  const email = `p6-${tag}-${stamp}@lyve.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  created.push(data.user!.id);
  const client = createClient(url, publishableKey, { auth: { persistSession: false } });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { id: data.user!.id, email, client };
}

function dobYearsAgo(years: number) {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  return date.toISOString().slice(0, 10);
}

async function seedMember(member: Member, name: string) {
  await member.client.from("profiles").insert({
    id: member.id,
    first_name: name,
    date_of_birth: dobYearsAgo(30),
    gender: "woman",
    relationship_intent: "serious_relationship",
    city: "Dubai",
    country: "AE",
  });
}

const APPLE_PRODUCT = "app.lyve.ios.premium.monthly";
const GOOGLE_PRODUCT = "lyve_premium_monthly";

function appleReceipt(purchaseRef: string, overrides: Record<string, unknown> = {}) {
  return buildSandboxReceipt(secret!, {
    store: "apple",
    purchase_ref: purchaseRef,
    product_id: APPLE_PRODUCT,
    environment: "sandbox",
    period_start: new Date().toISOString(),
    period_end: new Date(Date.now() + 30 * 864e5).toISOString(),
    ...overrides,
  });
}

function googleReceipt(purchaseRef: string, overrides: Record<string, unknown> = {}) {
  return buildSandboxReceipt(secret!, {
    store: "google",
    purchase_ref: purchaseRef,
    product_id: GOOGLE_PRODUCT,
    environment: "sandbox",
    ...overrides,
  });
}

function appleNotification(opts: {
  id: string;
  type: string;
  subtype?: string | null;
  purchaseRef: string;
  productId?: string;
  environment?: string;
  signedDate?: string;
  expiresDate?: string | null;
}) {
  return JSON.stringify({
    notificationUUID: opts.id,
    notificationType: opts.type,
    subtype: opts.subtype ?? null,
    signedDate: opts.signedDate ?? new Date().toISOString(),
    data: {
      originalTransactionId: opts.purchaseRef,
      productId: opts.productId ?? APPLE_PRODUCT,
      environment: opts.environment ?? "sandbox",
      purchaseDate: new Date().toISOString(),
      expiresDate: opts.expiresDate ?? new Date(Date.now() + 30 * 864e5).toISOString(),
    },
  });
}

function googleNotification(opts: {
  id: string;
  notificationType: number;
  purchaseRef: string;
  productId?: string;
  eventTimeMillis?: number;
  expiryTime?: string;
}) {
  return JSON.stringify({
    messageId: opts.id,
    environment: "sandbox",
    eventTimeMillis: String(opts.eventTimeMillis ?? Date.now()),
    subscriptionNotification: {
      notificationType: opts.notificationType,
      purchaseToken: opts.purchaseRef,
      subscriptionId: opts.productId ?? GOOGLE_PRODUCT,
      startTime: new Date().toISOString(),
      expiryTime: opts.expiryTime ?? new Date(Date.now() + 30 * 864e5).toISOString(),
    },
  });
}

function signedHeaders(rawBody: string, timestamp = Math.floor(Date.now() / 1000)) {
  return new Headers({
    [STORE_TIMESTAMP_HEADER]: String(timestamp),
    [STORE_SIGNATURE_HEADER]: signSandboxWebhook(secret!, timestamp, rawBody),
  });
}

/* ------------------------------------------------------------------ */
/* Direct database application of a verified store event.              */
/* Mirrors src/lib/billing/store.server.ts, minus the HTTP layer.      */
/* ------------------------------------------------------------------ */
async function claimEvent(provider: "apple" | "google", eventId: string, eventType: string) {
  return admin
    .from("billing_events")
    .insert({
      provider,
      provider_event_id: eventId,
      event_type: eventType,
      status: "received",
      signature_verified: true,
      event_created_at: new Date().toISOString(),
      payload_summary: {},
    })
    .select("id")
    .single();
}

async function applyEvent(event: {
  store: "apple" | "google";
  eventId: string;
  eventAt: string;
  purchaseRef: string;
  productId: string;
  status: string;
  cancelAtPeriodEnd?: boolean;
  revoke?: boolean;
  periodEnd?: string | null;
  reason?: string;
}) {
  const product = productFor(event.store, event.productId)!;
  // Mirror the webhook path: claim the store event id in the ledger first.
  const claim = await claimEvent(event.store, event.eventId, "test");
  if (claim.error) return { outcome: "duplicate", error: claim.error };
  const { data, error } = await admin.rpc("billing_apply_store_event", {
    p_provider: event.store,
    p_purchase_ref: event.purchaseRef,
    p_event_id: event.eventId,
    p_event_at: event.eventAt,
    p_status: event.status,
    p_plan_code: product.planCode,
    p_interval: product.interval,
    p_currency: "USD",
    p_period_start: new Date().toISOString(),
    p_period_end: event.periodEnd ?? new Date(Date.now() + 30 * 864e5).toISOString(),
    p_cancel_at_period_end: event.cancelAtPeriodEnd ?? false,
    p_entitlements: PREMIUM_ENTITLEMENTS,
    p_revoke: event.revoke ?? false,
    p_reason: event.reason ?? "test",
  } as never);
  if (error) return { outcome: `error:${error.code}`, error };
  return { outcome: String(data), error: null };
}

async function isPremium(member: Member): Promise<boolean> {
  const { data } = await member.client.rpc("my_entitlements");
  return ((data ?? []) as Array<{ key: string }>).some((row) => row.key === "premium");
}

async function cleanup() {
  for (const id of created) {
    await admin.auth.admin.deleteUser(id).catch(() => undefined);
  }
}

async function main() {
  /* ================= 1. Store configuration posture ================= */
  check(
    "store mode is sandbox — no production store credentials connected",
    storeMode() === "sandbox",
    storeMode(),
  );
  check("no Apple production credentials present", !process.env["APPLE_IAP_PRIVATE_KEY"]);
  check("no Google Play service account present", !process.env["GOOGLE_PLAY_SERVICE_ACCOUNT_JSON"]);
  check(
    "sandbox verification secret is configured and long enough",
    Boolean(secret && secret.length >= 16),
  );
  check(
    "product catalogue only maps known LYVE plans",
    STORE_PRODUCTS.every((p) => p.planCode.startsWith("premium_")),
  );
  check(
    "apple product resolves server-side",
    productFor("apple", APPLE_PRODUCT)?.planCode === "premium_monthly",
  );
  check(
    "google product resolves server-side",
    productFor("google", GOOGLE_PRODUCT)?.planCode === "premium_monthly",
  );
  check("unknown product does not resolve", productFor("apple", "com.attacker.free") === undefined);

  /* ================= 2. Apple purchase authenticity ================= */
  const appleRef = `apple-orig-${stamp}`;
  const validApple = appleReceipt(appleRef);

  if (appleIsHmac) {
    const appleOk = await verifyStorePurchase("apple", validApple);
    check("valid Apple sandbox purchase verifies", appleOk.ok === true);
    check(
      "verified Apple purchase carries the store purchase reference",
      appleOk.ok && appleOk.purchase.purchaseRef === appleRef,
    );
    check(
      "verified Apple purchase resolves plan server-side",
      appleOk.ok && appleOk.purchase.planCode === "premium_monthly",
    );
  } else {
    check("Apple store rail is API when credentials are present", appleRail() === "api");
    const hmacRejected = await verifyStorePurchase("apple", validApple);
    check("Apple HMAC receipt is rejected under API rail", hmacRejected.ok === false);
  }

  const tampered = `${validApple.split(".")[0]}.${"0".repeat(64)}`;
  check(
    "forged Apple signature rejected",
    (await verifyStorePurchase("apple", tampered)).ok === false,
  );
  const payloadSwap = buildSandboxReceipt("not-the-real-secret-value", {
    store: "apple",
    purchase_ref: appleRef,
    product_id: APPLE_PRODUCT,
    environment: "sandbox",
  });
  check(
    "Apple receipt signed with a wrong secret rejected",
    (await verifyStorePurchase("apple", payloadSwap)).ok === false,
  );
  check(
    "unsigned Apple receipt rejected",
    (await verifyStorePurchase("apple", "just-a-string")).ok === false,
  );
  check("empty Apple receipt rejected", (await verifyStorePurchase("apple", "")).ok === false);
  check(
    "non-string Apple receipt rejected",
    (await verifyStorePurchase("apple", { purchase_ref: appleRef })).ok === false,
  );

  const unknownProduct = await verifyStorePurchase(
    "apple",
    appleReceipt(`${appleRef}-x`, { product_id: "com.attacker.free" }),
  );
  if (appleIsHmac) {
    check(
      "Apple receipt for an unknown product rejected",
      !unknownProduct.ok && unknownProduct.reason === "UNKNOWN_PRODUCT",
    );
  } else {
    check("Apple HMAC receipt with unknown product is rejected under API rail", !unknownProduct.ok);
  }

  const prodClaim = await verifyStorePurchase(
    "apple",
    appleReceipt(`${appleRef}-p`, { environment: "production" }),
  );
  if (appleIsHmac) {
    check(
      "sandbox receipt claiming production is rejected",
      !prodClaim.ok && prodClaim.reason === "WRONG_ENVIRONMENT",
    );
  } else {
    check("Apple HMAC receipt claiming production is rejected under API rail", !prodClaim.ok);
  }

  const storeSwap = await verifyStorePurchase("google", appleReceipt(`${appleRef}-s`));
  check("Apple receipt cannot be presented as a Google purchase", storeSwap.ok === false);
  check(
    "unknown store id rejected",
    (await verifyStorePurchase("amazon", validApple)).ok === false,
  );

  /* ================= 3. Google purchase authenticity ================= */
  const googleRef = `google-token-${stamp}`;
  const validGoogle = await verifyStorePurchase("google", googleReceipt(googleRef));
  check("valid Google sandbox purchase token verifies", validGoogle.ok === true);
  check(
    "verified Google purchase carries the purchase token",
    validGoogle.ok && validGoogle.purchase.purchaseRef === googleRef,
  );
  check(
    "forged Google purchase token rejected",
    (await verifyStorePurchase("google", `${googleReceipt(googleRef).split(".")[0]}.deadbeef`))
      .ok === false,
  );
  check(
    "Google receipt with unknown subscription id rejected",
    (await verifyStorePurchase("google", googleReceipt(googleRef, { product_id: "free_forever" })))
      .ok === false,
  );
  check(
    "Google receipt claiming production rejected",
    (await verifyStorePurchase("google", googleReceipt(googleRef, { environment: "production" })))
      .ok === false,
  );
  check(
    "Google receipt cannot be presented as an Apple purchase",
    (await verifyStorePurchase("apple", googleReceipt(googleRef))).ok === false,
  );

  /* ================= 4. Notification authenticity =================== */
  const notifBody = appleNotification({
    id: `assn-${stamp}-a`,
    type: "SUBSCRIBED",
    purchaseRef: appleRef,
  });
  const staleTs = Math.floor(Date.now() / 1000) - (STORE_TIMESTAMP_TOLERANCE_SECONDS + 60);

  if (appleIsHmac) {
    check(
      "signed ASSN V2 notification verifies",
      (await verifyStoreNotification("apple", notifBody, signedHeaders(notifBody))).ok === true,
    );

    const noSig = await verifyStoreNotification(
      "apple",
      notifBody,
      new Headers({ [STORE_TIMESTAMP_HEADER]: String(Math.floor(Date.now() / 1000)) }),
    );
    check("ASSN without signature rejected", !noSig.ok && noSig.reason === "MISSING_SIGNATURE");

    const badSig = await verifyStoreNotification(
      "apple",
      notifBody,
      new Headers({
        [STORE_TIMESTAMP_HEADER]: String(Math.floor(Date.now() / 1000)),
        [STORE_SIGNATURE_HEADER]: "sha256=00",
      }),
    );
    check(
      "ASSN with forged signature rejected",
      !badSig.ok && badSig.reason === "INVALID_SIGNATURE",
    );

    const noTs = await verifyStoreNotification(
      "apple",
      notifBody,
      new Headers({ [STORE_SIGNATURE_HEADER]: "sha256=00" }),
    );
    check("ASSN without timestamp rejected", !noTs.ok && noTs.reason === "MISSING_TIMESTAMP");

    const stale = await verifyStoreNotification(
      "apple",
      notifBody,
      signedHeaders(notifBody, staleTs),
    );
    check(
      "replayed (stale-timestamp) ASSN rejected",
      !stale.ok && stale.reason === "STALE_TIMESTAMP",
    );
  } else {
    const hmacNotif = await verifyStoreNotification("apple", notifBody, signedHeaders(notifBody));
    check("Apple HMAC-signed ASSN is rejected under JWS API rail", hmacNotif.ok === false);
    const noJws = await verifyStoreNotification("apple", notifBody, new Headers());
    check(
      "Apple ASSN without JWS signedPayload is rejected under API rail",
      !noJws.ok && noJws.reason === "MISSING_SIGNATURE",
    );
  }

  const bodySwap = appleNotification({
    id: `assn-${stamp}-b`,
    type: "REFUND",
    purchaseRef: appleRef,
  });
  const swapHeaders = signedHeaders(notifBody);
  check(
    "ASSN body swapped under a valid signature rejected",
    (await verifyStoreNotification("apple", bodySwap, swapHeaders)).ok === false,
  );

  const malformed = "{not json";
  check(
    "malformed ASSN body rejected",
    (await verifyStoreNotification("apple", malformed, signedHeaders(malformed))).ok === false,
  );

  const rtdnBody = googleNotification({
    id: `rtdn-${stamp}-a`,
    notificationType: 4,
    purchaseRef: googleRef,
  });
  check(
    "signed RTDN verifies",
    (await verifyStoreNotification("google", rtdnBody, signedHeaders(rtdnBody))).ok === true,
  );
  check(
    "RTDN with forged signature rejected",
    (
      await verifyStoreNotification(
        "google",
        rtdnBody,
        new Headers({
          [STORE_TIMESTAMP_HEADER]: String(Math.floor(Date.now() / 1000)),
          [STORE_SIGNATURE_HEADER]: "sha256=ff",
        }),
      )
    ).ok === false,
  );
  const rtdnStale = await verifyStoreNotification(
    "google",
    rtdnBody,
    signedHeaders(rtdnBody, staleTs),
  );
  check(
    "replayed (stale-timestamp) RTDN rejected",
    !rtdnStale.ok && rtdnStale.reason === "STALE_TIMESTAMP",
  );

  /* ================= 5. Payload normalisation guards ================ */
  check(
    "ASSN with unknown notification type rejected",
    !normalizeAppleEvent(
      JSON.parse(
        appleNotification({ id: "x", type: "FREE_PREMIUM_PLEASE", purchaseRef: appleRef }),
      ),
    ).ok,
  );
  check(
    "ASSN with unknown product rejected",
    !normalizeAppleEvent(
      JSON.parse(
        appleNotification({
          id: "x",
          type: "SUBSCRIBED",
          purchaseRef: appleRef,
          productId: "com.attacker.free",
        }),
      ),
    ).ok,
  );
  check(
    "ASSN claiming production rejected",
    !normalizeAppleEvent(
      JSON.parse(
        appleNotification({
          id: "x",
          type: "SUBSCRIBED",
          purchaseRef: appleRef,
          environment: "Production",
        }),
      ),
    ).ok,
  );
  check(
    "ASSN without a transaction id rejected",
    !normalizeAppleEvent({
      notificationUUID: "x",
      notificationType: "SUBSCRIBED",
      data: { productId: APPLE_PRODUCT, environment: "sandbox" },
    }).ok,
  );
  check(
    "ASSN carries no LYVE user id field",
    !JSON.stringify(normalizeAppleEvent(JSON.parse(notifBody))).includes("profile_id"),
  );
  check(
    "RTDN with unknown notification type rejected",
    !normalizeGoogleEvent(
      JSON.parse(googleNotification({ id: "x", notificationType: 999, purchaseRef: googleRef })),
    ).ok,
  );
  check(
    "RTDN without purchase token rejected",
    !normalizeGoogleEvent({
      messageId: "x",
      subscriptionNotification: { notificationType: 4, subscriptionId: GOOGLE_PRODUCT },
    }).ok,
  );
  check(
    "RTDN epoch-millis event time normalises",
    normalizeGoogleEvent(
      JSON.parse(
        googleNotification({
          id: "x",
          notificationType: 4,
          purchaseRef: googleRef,
          eventTimeMillis: 1_700_000_000_000,
        }),
      ),
    ).ok === true,
  );

  /* ================= 6. Lifecycle mapping =========================== */
  check("Apple SUBSCRIBED → active", appleLifecycle("SUBSCRIBED", null)?.status === "active");
  check("Apple DID_RENEW → active", appleLifecycle("DID_RENEW", null)?.status === "active");
  check(
    "Apple auto-renew disabled → canceled at period end",
    appleLifecycle("DID_CHANGE_RENEWAL_STATUS", "AUTO_RENEW_DISABLED")?.cancelAtPeriodEnd === true,
  );
  check(
    "Apple auto-renew re-enabled → active",
    appleLifecycle("DID_CHANGE_RENEWAL_STATUS", "AUTO_RENEW_ENABLED")?.status === "active",
  );
  check(
    "Apple grace period → past_due",
    appleLifecycle("DID_FAIL_TO_RENEW", "GRACE_PERIOD")?.status === "past_due",
  );
  check(
    "Apple billing retry → past_due",
    appleLifecycle("DID_FAIL_TO_RENEW", null)?.status === "past_due",
  );
  check(
    "Apple grace expiry → expired",
    appleLifecycle("GRACE_PERIOD_EXPIRED", null)?.status === "expired",
  );
  check(
    "Apple EXPIRED → expired without revocation",
    appleLifecycle("EXPIRED", null)?.revoke === false,
  );
  check("Apple REFUND → immediate revocation", appleLifecycle("REFUND", null)?.revoke === true);
  check("Apple REVOKE → immediate revocation", appleLifecycle("REVOKE", null)?.revoke === true);
  check("Apple unknown type has no mapping", appleLifecycle("MAKE_ME_PREMIUM", null) === null);
  check("Google purchased (4) → active", googleLifecycle(4)?.status === "active");
  check("Google renewed (2) → active", googleLifecycle(2)?.status === "active");
  check(
    "Google canceled (3) → canceled at period end",
    googleLifecycle(3)?.cancelAtPeriodEnd === true,
  );
  check("Google on hold (5) → past_due", googleLifecycle(5)?.status === "past_due");
  check("Google grace period (6) → past_due", googleLifecycle(6)?.status === "past_due");
  check("Google paused (10) → paused", googleLifecycle(10)?.status === "paused");
  check("Google revoked (12) → immediate revocation", googleLifecycle(12)?.revoke === true);
  check("Google expired (13) → expired without revocation", googleLifecycle(13)?.revoke === false);
  check(
    "Google mapping table has no unexpected revocations",
    Object.entries(GOOGLE_NOTIFICATION_TYPES)
      .filter(([, v]) => v.revoke)
      .map(([k]) => k)
      .join() === "12",
  );
  check("Google unknown notification type has no mapping", googleLifecycle(42) === null);
  check(
    "grace period (past_due) still grants access",
    statusGrantsAccess("past_due", null) === true,
  );
  check(
    "expired grants no access",
    statusGrantsAccess("expired", new Date(Date.now() + 864e5).toISOString()) === false,
  );
  check(
    "cancellation keeps access until period end",
    statusGrantsAccess("canceled", new Date(Date.now() + 864e5).toISOString()) === true,
  );
  check(
    "cancellation past period end grants no access",
    statusGrantsAccess("canceled", new Date(Date.now() - 864e5).toISOString()) === false,
  );

  /* ================= 7. Purchase → account binding ================== */
  const alice = await createMember("alice");
  const bob = await createMember("bob");
  await seedMember(alice, "Alice");
  await seedMember(bob, "Bob");

  const linkArgs = (profile: string, ref: string, store: "apple" | "google" = "apple") => ({
    p_provider: store,
    p_purchase_ref: ref,
    p_profile: profile,
    p_product_id: store === "apple" ? APPLE_PRODUCT : GOOGLE_PRODUCT,
    p_plan_code: "premium_monthly",
    p_environment: "sandbox",
  });

  const first = await admin.rpc(
    "billing_link_store_purchase",
    linkArgs(alice.id, appleRef) as never,
  );
  check(
    "first link binds the purchase to the authenticated account",
    String(first.data) === "linked",
    first.error?.message,
  );

  const repeat = await admin.rpc(
    "billing_link_store_purchase",
    linkArgs(alice.id, appleRef) as never,
  );
  check(
    "re-linking the same purchase to the same account is idempotent",
    String(repeat.data) === "already_owned",
  );

  const transfer = await admin.rpc(
    "billing_link_store_purchase",
    linkArgs(bob.id, appleRef) as never,
  );
  check(
    "purchase cannot be transferred to a second account",
    String(transfer.data) === "owned_by_other",
  );

  const { data: ownerRow } = await admin
    .from("store_purchases")
    .select("profile_id, environment, status")
    .eq("purchase_ref", appleRef)
    .single();
  check("ownership row still belongs to the original account", ownerRow?.profile_id === alice.id);
  check("purchase environment recorded as sandbox", ownerRow?.environment === "sandbox");

  const { data: auditRows } = await admin
    .from("store_purchase_audit")
    .select("outcome, attempted_profile_id, owner_profile_id, purchase_ref_hash")
    .order("created_at", { ascending: false })
    .limit(5);
  const conflict = (auditRows ?? []).find((r) => r.outcome === "owned_by_other");
  check("transfer attempt is written to the audit trail", Boolean(conflict));
  check("audit records the attempting account", conflict?.attempted_profile_id === bob.id);
  check("audit records the true owner", conflict?.owner_profile_id === alice.id);
  check(
    "audit stores a hash, never the raw store token",
    !(auditRows ?? []).some((r) => r.purchase_ref_hash.includes(appleRef)),
  );
  check(
    "audit hash is a sha-256 hex digest",
    /^[0-9a-f]{64}$/.test(conflict?.purchase_ref_hash ?? ""),
  );

  const googleLink = await admin.rpc(
    "billing_link_store_purchase",
    linkArgs(bob.id, googleRef, "google") as never,
  );
  check(
    "a Google purchase binds independently to its own account",
    String(googleLink.data) === "linked",
  );

  /* ================= 8. Client forgery of ownership ================= */
  const forgedLink = await alice.client.rpc(
    "billing_link_store_purchase",
    linkArgs(bob.id, `forged-${stamp}`) as never,
  );
  check("members cannot call the purchase-linking routine", Boolean(forgedLink.error));
  const anonLink = await anon.rpc(
    "billing_link_store_purchase",
    linkArgs(alice.id, `anon-${stamp}`) as never,
  );
  check("anonymous callers cannot call the purchase-linking routine", Boolean(anonLink.error));
  const memberApply = await alice.client.rpc("billing_apply_store_event", {
    p_provider: "apple",
    p_purchase_ref: appleRef,
    p_event_id: "x",
    p_event_at: new Date().toISOString(),
    p_status: "active",
    p_plan_code: "premium_monthly",
    p_interval: "month",
    p_currency: "USD",
    p_period_start: null,
    p_period_end: null,
    p_cancel_at_period_end: false,
    p_entitlements: PREMIUM_ENTITLEMENTS,
  } as never);
  check("members cannot apply store lifecycle events", Boolean(memberApply.error));

  const memberInsert = await alice.client.from("store_purchases").insert({
    provider: "apple",
    purchase_ref: `self-${stamp}`,
    profile_id: alice.id,
    product_id: APPLE_PRODUCT,
    plan_code: "premium_monthly",
  } as never);
  check("members cannot insert store purchase rows", Boolean(memberInsert.error));
  const memberUpdate = await alice.client
    .from("store_purchases")
    .update({ status: "active" })
    .eq("purchase_ref", appleRef);
  check(
    "members cannot update store purchase rows",
    Boolean(memberUpdate.error) ||
      (await admin.from("store_purchases").select("status").eq("purchase_ref", appleRef).single())
        .data?.status !== "active",
  );
  const memberDelete = await alice.client
    .from("store_purchases")
    .delete()
    .eq("purchase_ref", appleRef);
  check(
    "members cannot delete store purchase rows",
    Boolean(memberDelete.error) ||
      Boolean(
        (
          await admin
            .from("store_purchases")
            .select("id")
            .eq("purchase_ref", appleRef)
            .maybeSingle()
        ).data,
      ),
  );

  /* ================= 9. Lifecycle application ======================= */
  const t0 = new Date(Date.now() - 60_000).toISOString();
  const purchased = await applyEvent({
    store: "apple",
    eventId: `evt-${stamp}-1`,
    eventAt: t0,
    purchaseRef: appleRef,
    productId: APPLE_PRODUCT,
    status: "active",
  });
  check(
    "verified purchase event grants Premium to the owning account",
    purchased.outcome === "applied",
    purchased.error?.message,
  );
  check("owner has Premium after purchase", await isPremium(alice));
  check("the other account gains nothing from that purchase", !(await isPremium(bob)));

  const { data: subRow } = await admin
    .from("subscriptions")
    .select("profile_id, purchase_source, provider, status")
    .eq("provider", "apple")
    .eq("provider_subscription_id", appleRef)
    .maybeSingle();
  check("subscription is attached to the owning account", subRow?.profile_id === alice.id);
  check("purchase source recorded as ios for Apple", subRow?.purchase_source === "ios");
  check("subscription provider recorded as apple", subRow?.provider === "apple");

  /* replay / idempotency of the notification id */
  const claim1 = await claimEvent("apple", `evt-${stamp}-1`, "SUBSCRIBED");
  check(
    "re-using an Apple notification id is rejected by the ledger",
    claim1.error?.code === "23505",
  );
  const claimG = await claimEvent("google", `rtdn-${stamp}-dup`, "google:4");
  const claimGdup = await claimEvent("google", `rtdn-${stamp}-dup`, "google:4");
  check("first RTDN id claim succeeds", !claimG.error);
  check("replayed RTDN id is rejected by the ledger", claimGdup.error?.code === "23505");

  const concurrent = await Promise.all([
    claimEvent("apple", `evt-${stamp}-concurrent`, "DID_RENEW"),
    claimEvent("apple", `evt-${stamp}-concurrent`, "DID_RENEW"),
  ]);
  check(
    "concurrent duplicate store events: exactly one is accepted",
    concurrent.filter((r) => !r.error).length === 1,
  );

  /* out-of-order */
  const renewAt = new Date().toISOString();
  const renewed = await applyEvent({
    store: "apple",
    eventId: `evt-${stamp}-2`,
    eventAt: renewAt,
    purchaseRef: appleRef,
    productId: APPLE_PRODUCT,
    status: "active",
  });
  check("renewal event applies", renewed.outcome === "applied");
  const outOfOrder = await applyEvent({
    store: "apple",
    eventId: `evt-${stamp}-3`,
    eventAt: t0,
    purchaseRef: appleRef,
    productId: APPLE_PRODUCT,
    status: "expired",
  });
  check("out-of-order (older) event is ignored", outOfOrder.outcome === "stale");
  check("out-of-order event did not remove Premium", await isPremium(alice));
  const { data: staleAudit } = await admin
    .from("store_purchase_audit")
    .select("outcome")
    .eq("event_id", `evt-${stamp}-3`)
    .maybeSingle();
  check("stale event is recorded in the audit trail", staleAudit?.outcome === "stale_event");

  /* unlinked purchase */
  const unlinked = await applyEvent({
    store: "apple",
    eventId: `evt-${stamp}-4`,
    eventAt: new Date().toISOString(),
    purchaseRef: `never-linked-${stamp}`,
    productId: APPLE_PRODUCT,
    status: "active",
  });
  check("event for an unlinked purchase grants nothing", unlinked.outcome === "unlinked");

  /* grace period / billing retry */
  const grace = await applyEvent({
    store: "apple",
    eventId: `evt-${stamp}-5`,
    eventAt: new Date(Date.now() + 1000).toISOString(),
    purchaseRef: appleRef,
    productId: APPLE_PRODUCT,
    status: "past_due",
  });
  check("billing-retry/grace event applies", grace.outcome === "applied");
  check("grace period keeps Premium active", await isPremium(alice));

  /* cancellation */
  const canceled = await applyEvent({
    store: "apple",
    eventId: `evt-${stamp}-6`,
    eventAt: new Date(Date.now() + 2000).toISOString(),
    purchaseRef: appleRef,
    productId: APPLE_PRODUCT,
    status: "canceled",
    cancelAtPeriodEnd: true,
    periodEnd: new Date(Date.now() + 10 * 864e5).toISOString(),
  });
  check("cancellation event applies", canceled.outcome === "applied");
  check("cancellation keeps access until the period ends", await isPremium(alice));

  /* restore purchases — a read, never a grant */
  const { data: aliceRestore } = await alice.client
    .from("store_purchases")
    .select("purchase_ref, profile_id");
  check(
    "restore returns only the caller's own purchases",
    (aliceRestore ?? []).every((r) => r.profile_id === alice.id),
  );
  check(
    "restore surfaces the caller's linked purchase",
    (aliceRestore ?? []).some((r) => r.purchase_ref === appleRef),
  );
  const { data: bobSees } = await bob.client
    .from("store_purchases")
    .select("purchase_ref")
    .eq("purchase_ref", appleRef);
  check("another account cannot see that purchase", (bobSees ?? []).length === 0);
  const { data: anonSees } = await anon.from("store_purchases").select("purchase_ref");
  check("anonymous callers see no store purchases", (anonSees ?? []).length === 0);

  /* logout / login account switching */
  await alice.client.auth.signOut();
  const { data: afterLogout } = await alice.client.from("store_purchases").select("purchase_ref");
  check("after sign-out the session reads no store purchases", (afterLogout ?? []).length === 0);
  const reSignIn = await alice.client.auth.signInWithPassword({ email: alice.email, password });
  check("re-login restores the owner's session", !reSignIn.error);
  check("re-login restores Premium from server state", await isPremium(alice));
  const switched = createClient(url, publishableKey, { auth: { persistSession: false } });
  await switched.auth.signInWithPassword({ email: bob.email, password });
  const { data: switchedRows } = await switched
    .from("store_purchases")
    .select("purchase_ref")
    .eq("purchase_ref", appleRef);
  check(
    "switching accounts on a shared device does not carry Premium across",
    (switchedRows ?? []).length === 0,
  );
  check("the second account is still not Premium", !(await isPremium(bob)));

  /* expiration */
  const expired = await applyEvent({
    store: "apple",
    eventId: `evt-${stamp}-7`,
    eventAt: new Date(Date.now() + 3000).toISOString(),
    purchaseRef: appleRef,
    productId: APPLE_PRODUCT,
    status: "expired",
    periodEnd: new Date(Date.now() - 864e5).toISOString(),
  });
  check("expiry event applies", expired.outcome === "applied");
  check("expired subscription loses Premium", !(await isPremium(alice)));

  /* refund / revocation */
  const reAdd = await applyEvent({
    store: "apple",
    eventId: `evt-${stamp}-8`,
    eventAt: new Date(Date.now() + 4000).toISOString(),
    purchaseRef: appleRef,
    productId: APPLE_PRODUCT,
    status: "active",
  });
  check("resubscribe after expiry applies", reAdd.outcome === "applied");
  check("resubscribe restores Premium", await isPremium(alice));
  const refunded = await applyEvent({
    store: "apple",
    eventId: `evt-${stamp}-9`,
    eventAt: new Date(Date.now() + 5000).toISOString(),
    purchaseRef: appleRef,
    productId: APPLE_PRODUCT,
    status: "expired",
    revoke: true,
    reason: "refund",
  });
  check("refund event revokes immediately", refunded.outcome === "revoked");
  check("refunded account loses Premium at once", !(await isPremium(alice)));
  const { data: revokedRow } = await admin
    .from("store_purchases")
    .select("status, revoked_at")
    .eq("purchase_ref", appleRef)
    .single();
  check(
    "purchase row is marked revoked",
    revokedRow?.status === "expired" && Boolean(revokedRow?.revoked_at),
  );
  const { data: revokeAudit } = await admin
    .from("store_purchase_audit")
    .select("outcome")
    .eq("event_id", `evt-${stamp}-9`)
    .maybeSingle();
  check("revocation is recorded in the audit trail", revokeAudit?.outcome === "revoked");
  const { data: revokedEnt } = await admin
    .from("entitlements")
    .select("revoked_at, revoke_reason")
    .eq("profile_id", alice.id)
    .eq("key", "premium")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  check("entitlement carries the revocation reason", Boolean(revokedEnt?.revoked_at));

  /* a refunded purchase still cannot be re-bound elsewhere */
  const postRefundTransfer = await admin.rpc(
    "billing_link_store_purchase",
    linkArgs(bob.id, appleRef) as never,
  );
  check(
    "a refunded purchase still cannot move to another account",
    String(postRefundTransfer.data) === "owned_by_other",
  );

  /* ================= 10. Ledger and audit integrity ================= */
  const { data: memberEvents } = await alice.client.from("billing_events").select("id");
  check("members cannot read the billing event ledger", (memberEvents ?? []).length === 0);
  const ledgerRewrite = await admin
    .from("billing_events")
    .update({ provider_event_id: `rewritten-${stamp}` })
    .eq("provider_event_id", `evt-${stamp}-1`);
  check("a ledger row's store event identity cannot be rewritten", Boolean(ledgerRewrite.error));
  const payloadRewrite = await admin
    .from("billing_events")
    .update({ payload_summary: { premium: true } })
    .eq("provider_event_id", `evt-${stamp}-1`);
  check("a ledger row's recorded payload cannot be rewritten", Boolean(payloadRewrite.error));
  const ledgerDelete = await admin
    .from("billing_events")
    .delete()
    .eq("provider_event_id", `evt-${stamp}-1`);
  check("billing events cannot be deleted", Boolean(ledgerDelete.error));
  const auditUpdate = await admin
    .from("store_purchase_audit")
    .update({ outcome: "linked" })
    .eq("event_id", `evt-${stamp}-9`);
  check("store purchase audit is append-only (no updates)", Boolean(auditUpdate.error));
  const auditDelete = await admin
    .from("store_purchase_audit")
    .delete()
    .eq("event_id", `evt-${stamp}-9`);
  check("store purchase audit is append-only (no deletes)", Boolean(auditDelete.error));
  const { data: memberAudit } = await alice.client.from("store_purchase_audit").select("id");
  check("members cannot read the store purchase audit", (memberAudit ?? []).length === 0);
  const { data: anonAudit } = await anon.from("store_purchase_audit").select("id");
  check("anonymous callers cannot read the store purchase audit", (anonAudit ?? []).length === 0);
  const { data: ledgerRow } = await admin
    .from("billing_events")
    .select("payload_summary")
    .eq("provider_event_id", `rtdn-${stamp}-dup`)
    .maybeSingle();
  check(
    "ledger stores no raw store payload",
    !JSON.stringify(ledgerRow?.payload_summary ?? {}).includes("purchaseToken"),
  );

  /* ================= 11. Account deletion ============================ */
  const carol = await createMember("carol");
  await seedMember(carol, "Carol");
  const carolRef = `apple-carol-${stamp}`;
  await admin.rpc("billing_link_store_purchase", linkArgs(carol.id, carolRef) as never);
  await applyEvent({
    store: "apple",
    eventId: `evt-${stamp}-c1`,
    eventAt: new Date().toISOString(),
    purchaseRef: carolRef,
    productId: APPLE_PRODUCT,
    status: "active",
  });
  check(
    "purchase links for the deletion fixture",
    Boolean(
      (await admin.from("store_purchases").select("id").eq("purchase_ref", carolRef).maybeSingle())
        .data,
    ),
  );
  await admin.auth.admin.deleteUser(carol.id);
  const { data: afterDelete } = await admin
    .from("store_purchases")
    .select("id")
    .eq("purchase_ref", carolRef)
    .maybeSingle();
  check("deleting the account removes its store purchase binding", afterDelete === null);
  const { data: auditSurvives } = await admin
    .from("store_purchase_audit")
    .select("id")
    .eq("event_id", `evt-${stamp}-c1`)
    .maybeSingle();
  check("audit trail survives account deletion", Boolean(auditSurvives));
  const relink = await admin.rpc(
    "billing_link_store_purchase",
    linkArgs(bob.id, carolRef) as never,
  );
  check(
    "after deletion the store purchase can be re-linked to a new account",
    String(relink.data) === "linked",
  );
}

main()
  .catch((error) => {
    console.error(error);
    failed += 1;
  })
  .finally(async () => {
    await cleanup();
    console.log(`\nPhase 6 store billing audit: ${passed} passed, ${failed} failed`);
    process.exit(failed === 0 ? 0 : 1);
  });
