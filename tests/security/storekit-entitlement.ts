/**
 * LYVE — StoreKit entitlement activation.
 *
 * Premise under test: Premium access is granted by a VERIFIED store
 * entitlement and by nothing else. A linked-and-active StoreKit transaction
 * must activate the member's Premium entitlement immediately, a restore of the
 * same transaction must be idempotent, and expiry/refund must remove access.
 * No client flag, plan code, or local state may substitute for the store.
 *
 * Run:  bun run tests/security/storekit-entitlement.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PREMIUM_ENTITLEMENTS } from "../../src/config/billing";
import { productFor } from "../../src/lib/billing/store-core";

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

const stamp = Date.now().toString(36);
const password = `Lyve!${stamp}Aa1`;
const created: string[] = [];
const APPLE_PRODUCT = "app.lyve.ios.premium.monthly";

type Member = { id: string; client: SupabaseClient };

async function createMember(tag: string): Promise<Member> {
  const email = `sk-${tag}-${stamp}@lyve.test`;
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
  const dob = new Date();
  dob.setFullYear(dob.getFullYear() - 30);
  await client.from("profiles").insert({
    id: data.user!.id,
    first_name: `SK ${tag}`,
    date_of_birth: dob.toISOString().slice(0, 10),
    gender: "woman",
    relationship_intent: "serious_relationship",
    city: "Dubai",
    country: "AE",
  } as never);
  return { id: data.user!.id, client };
}

async function isPremium(member: Member): Promise<boolean> {
  const { data } = await member.client.rpc("my_entitlements");
  return ((data ?? []) as Array<{ key: string }>).some((row) => row.key === "premium");
}

function link(profile: string, ref: string) {
  return admin.rpc("billing_link_store_purchase", {
    p_provider: "apple",
    p_purchase_ref: ref,
    p_profile: profile,
    p_product_id: APPLE_PRODUCT,
    p_plan_code: "premium_monthly",
    p_environment: "sandbox",
  } as never);
}

async function apply(ref: string, eventId: string, status: string, revoke = false) {
  const product = productFor("apple", APPLE_PRODUCT)!;
  await admin
    .from("billing_events")
    .insert({ provider: "apple", event_id: eventId, event_type: "test" } as never);
  const { data, error } = await admin.rpc("billing_apply_store_event", {
    p_provider: "apple",
    p_purchase_ref: ref,
    p_event_id: eventId,
    p_event_at: new Date().toISOString(),
    p_status: status,
    p_plan_code: product.planCode,
    p_interval: product.interval,
    p_currency: "USD",
    p_period_start: new Date().toISOString(),
    p_period_end: new Date(Date.now() + 30 * 864e5).toISOString(),
    p_cancel_at_period_end: false,
    p_entitlements: PREMIUM_ENTITLEMENTS,
    p_revoke: revoke,
    p_reason: "storekit-entitlement-test",
  } as never);
  return { outcome: String(data), error };
}

async function cleanup() {
  for (const id of created) await admin.auth.admin.deleteUser(id).catch(() => undefined);
}

async function main() {
  const member = await createMember("owner");
  const other = await createMember("other");
  const ref = `sk-${stamp}`;

  check("a new account starts without Premium", (await isPremium(member)) === false);

  /* ---------- 1. Purchase → link → active → entitlement ---------- */
  const linked = await link(member.id, ref);
  check("StoreKit transaction binds to the purchasing account", String(linked.data) === "linked");
  check(
    "linking alone does not grant Premium before the store reports active",
    (await isPremium(member)) === false,
  );

  const activated = await apply(ref, `${ref}-active`, "active");
  check("active store entitlement is applied", !activated.error, activated.error?.message);
  check("Premium activates from the verified StoreKit entitlement", await isPremium(member));

  const { data: entitlementRows } = await member.client.rpc("my_entitlements");
  const keys = ((entitlementRows ?? []) as Array<{ key: string }>).map((row) => row.key);
  check(
    "every Premium entitlement in the plan is granted",
    PREMIUM_ENTITLEMENTS.every((key) => keys.includes(key)),
    keys,
  );

  const { data: sub } = await admin
    .from("subscriptions")
    .select("status, source, plan_code")
    .eq("profile_id", member.id)
    .maybeSingle();
  check("subscription records the iOS source", sub?.source === "ios", sub);
  check("subscription is active", sub?.status === "active", sub);

  /* ---------- 2. Restore is idempotent, never a second grant ---------- */
  const restored = await link(member.id, ref);
  check("restoring the same transaction is idempotent", String(restored.data) === "already_owned");
  check("Premium is still active after a restore", await isPremium(member));

  const { count } = await admin
    .from("store_purchases")
    .select("id", { count: "exact", head: true })
    .eq("purchase_ref", ref);
  check("restore does not duplicate the purchase row", count === 1, count);

  /* ---------- 3. Restore cannot move access to another account ---------- */
  const stolen = await link(other.id, ref);
  check("another account cannot restore someone else's purchase", String(stolen.data) === "owned_by_other");
  check("the second account gains no Premium", (await isPremium(other)) === false);

  /* ---------- 4. Expiry / refund removes access ---------- */
  const expired = await apply(ref, `${ref}-expired`, "expired", true);
  check("expiry event is applied", !expired.error, expired.error?.message);
  check("Premium is revoked when the store entitlement ends", (await isPremium(member)) === false);

  console.log(`\nStoreKit entitlement suite: ${passed} passed, ${failed} failed`);
}

try {
  await main();
} catch (error) {
  console.error(error);
  failed += 1;
  console.log(`\nStoreKit entitlement suite: ${passed} passed, ${failed} failed`);
} finally {
  await cleanup();
}
process.exit(failed === 0 ? 0 : 1);
