/**
 * LYVE maintenance suite — scheduled account purge + billing trigger privileges.
 *
 * Proves that the 30-day purge can only ever be run by the scheduler, that it
 * respects the retention window and cancellations, that it is idempotent, and
 * that no client-reachable path exists to it or to the billing ledger guard
 * trigger function.
 *
 * Run:  bun run tests/security/purge-audit.ts   (or via run-all.ts)
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  PURGE_SECRET_MIN_LENGTH,
  handleAccountPurgeRequest,
  purgeSecret,
  secretMatches,
} from "../../src/lib/maintenance/purge.server";

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
const password = `Purge-audit-${stamp}`;
const TEST_SECRET = `purge-audit-secret-${stamp}`;

type Member = { id: string; email: string; client: SupabaseClient };
const created: string[] = [];

async function createMember(tag: string): Promise<Member> {
  const email = `purge-${tag}-${stamp}@lyve.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
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
  const { error } = await member.client.from("profiles").insert({
    id: member.id,
    first_name: name,
    date_of_birth: dobYearsAgo(30),
    gender: "woman",
    relationship_intent: "serious_relationship",
    city: "Dubai",
    country: "AE",
    bio: "Purge audit fixture profile.",
  });
  if (error) throw error;
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}
function daysAhead(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

/** Puts an account into the deleted-pending state the purge job looks for. */
async function requestDeletion(
  member: Member,
  opts: { deletedAt: string; scheduledPurgeAt: string; status?: "pending" | "cancelled" },
) {
  const { error: profileError } = await admin
    .from("profiles")
    .update({ deleted_at: opts.deletedAt })
    .eq("id", member.id);
  if (profileError) throw profileError;
  const { error } = await admin.from("account_deletion_requests").insert({
    profile_id: member.id,
    status: opts.status ?? "pending",
    requested_at: opts.deletedAt,
    scheduled_purge_at: opts.scheduledPurgeAt,
  });
  if (error) throw error;
}

async function purgeRequest(headers: Record<string, string>) {
  return handleAccountPurgeRequest(new Request("https://lyve.test/api/public/cron/account-purge", {
    method: "POST",
    headers,
  }));
}

async function profileRow(id: string) {
  const { data } = await admin
    .from("profiles")
    .select("first_name, bio, city, account_status")
    .eq("id", id)
    .maybeSingle();
  return data;
}

async function deletionRow(id: string) {
  const { data } = await admin
    .from("account_deletion_requests")
    .select("status, processed_at")
    .eq("profile_id", id)
    .maybeSingle();
  return data;
}

async function cleanup() {
  for (const id of created) await admin.auth.admin.deleteUser(id).catch(() => undefined);
  await admin.from("store_rate_limits").delete().eq("bucket", "cron:account-purge");
}

async function main() {
  const originalSecret = process.env["ACCOUNT_PURGE_SECRET"];

  /* ============ A. Endpoint authentication ============ */

  delete process.env["ACCOUNT_PURGE_SECRET"];
  check("A1 an unconfigured deployment reports no purge secret", purgeSecret() === null);
  const unconfigured = await purgeRequest({ authorization: "Bearer anything" });
  check("A2 the purge endpoint is disabled when the secret is missing", unconfigured.status === 503, unconfigured);
  check("A3 the disabled endpoint performs no purge", !("purged" in unconfigured.body));

  process.env["ACCOUNT_PURGE_SECRET"] = "short";
  check("A4 a weak secret counts as not configured", purgeSecret() === null);
  const weak = await purgeRequest({ authorization: "Bearer short" });
  check("A5 a weak secret cannot be used to authenticate", weak.status === 503, weak);
  check("A6 the minimum secret length is enforced at 16+", PURGE_SECRET_MIN_LENGTH >= 16);

  process.env["ACCOUNT_PURGE_SECRET"] = TEST_SECRET;
  check("A7 a configured secret is resolved", purgeSecret() === TEST_SECRET);

  const noHeader = await purgeRequest({});
  check("A8 an unauthenticated purge attempt is refused", noHeader.status === 401, noHeader);

  const wrongSecret = await purgeRequest({ authorization: "Bearer not-the-secret-at-all" });
  check("A9 an invalid secret is refused", wrongSecret.status === 401, wrongSecret);

  const sameLengthWrong = await purgeRequest({
    authorization: `Bearer ${"x".repeat(TEST_SECRET.length)}`,
  });
  check("A10 an equal-length wrong secret is refused", sameLengthWrong.status === 401, sameLengthWrong);

  const nearMiss = await purgeRequest({
    authorization: `Bearer ${TEST_SECRET.slice(0, -1)}X`,
  });
  check("A11 a one-character-off secret is refused", nearMiss.status === 401, nearMiss);

  const prefix = await purgeRequest({ authorization: `Bearer ${TEST_SECRET.slice(0, 8)}` });
  check("A12 a truncated secret is refused", prefix.status === 401, prefix);

  const wrongScheme = await purgeRequest({ authorization: TEST_SECRET });
  check("A13 the raw secret without a bearer scheme is refused", wrongScheme.status === 401, wrongScheme);

  check("A14 comparison rejects a length mismatch", !secretMatches("abc", TEST_SECRET));
  check("A15 comparison accepts only the exact secret", secretMatches(TEST_SECRET, TEST_SECRET));
  check("A16 comparison rejects an empty presentation", !secretMatches("", TEST_SECRET));

  const headerVariant = await purgeRequest({ "x-cron-secret": TEST_SECRET });
  check("A17 the scheduler may present the secret in the dedicated header", headerVariant.status === 200, headerVariant);

  /* ============ B. Database-level reachability ============ */

  const anonPurge = await anon.rpc("purge_expired_accounts", { p_dry_run: true });
  check("B1 a visitor cannot invoke the purge routine", Boolean(anonPurge.error), anonPurge.error?.code);

  const member = await createMember("member");
  const victim = await createMember("victim");
  const premature = await createMember("premature");
  const cancelled = await createMember("cancelled");
  const active = await createMember("active");
  await Promise.all([
    seedMember(member, "Member"),
    seedMember(victim, "Victim"),
    seedMember(premature, "Premature"),
    seedMember(cancelled, "Cancelled"),
    seedMember(active, "Active"),
  ]);

  const memberPurge = await member.client.rpc("purge_expired_accounts", { p_dry_run: true });
  check("B2 a signed-in member cannot invoke the purge routine", Boolean(memberPurge.error), memberPurge.error?.code);

  const memberWetPurge = await member.client.rpc("purge_expired_accounts", { p_dry_run: false });
  check("B3 a signed-in member cannot invoke a live purge", Boolean(memberWetPurge.error), memberWetPurge.error?.code);

  const grants = await admin.rpc("purge_expired_accounts", { p_dry_run: true });
  check("B4 the service scheduler can invoke the routine", !grants.error, grants.error?.message);

  /* ============ C. Retention window correctness ============ */

  await requestDeletion(victim, { deletedAt: daysAgo(31), scheduledPurgeAt: daysAgo(1) });
  await requestDeletion(premature, { deletedAt: daysAgo(3), scheduledPurgeAt: daysAhead(27) });
  await requestDeletion(cancelled, {
    deletedAt: daysAgo(40),
    scheduledPurgeAt: daysAgo(10),
    status: "cancelled",
  });

  const run = await purgeRequest({ authorization: `Bearer ${TEST_SECRET}` });
  check("C1 an authenticated scheduled purge succeeds", run.status === 200, run);
  check("C2 the purge reports a count only, never member detail", JSON.stringify(run.body).includes("purged"));
  check(
    "C3 the purge response carries no profile identifiers",
    !JSON.stringify(run.body).includes(victim.id) && !JSON.stringify(run.body).includes(victim.email),
  );

  const victimProfile = await profileRow(victim.id);
  check("C4 an expired account is scrubbed of its profile text", !victimProfile?.first_name && !victimProfile?.bio, victimProfile);
  check("C5 an expired account loses its location", !victimProfile?.city, victimProfile);
  check("C6 an expired account is marked deleted", victimProfile?.account_status === "deleted", victimProfile);
  const victimRequest = await deletionRow(victim.id);
  check("C7 the deletion request is completed", victimRequest?.status === "completed", victimRequest);
  check("C8 the completion is timestamped", Boolean(victimRequest?.processed_at), victimRequest);

  const prematureProfile = await profileRow(premature.id);
  check("C9 an account inside the 30-day window is NOT purged", prematureProfile?.first_name === "Premature", prematureProfile);
  const prematureRequest = await deletionRow(premature.id);
  check("C10 a pending in-window request stays pending", prematureRequest?.status === "pending", prematureRequest);

  const cancelledProfile = await profileRow(cancelled.id);
  check("C11 a cancelled deletion request is never purged", cancelledProfile?.first_name === "Cancelled", cancelledProfile);
  const cancelledRequest = await deletionRow(cancelled.id);
  check("C12 a cancelled request is left cancelled", cancelledRequest?.status === "cancelled", cancelledRequest);

  const activeProfile = await profileRow(active.id);
  check("C13 an active account with no deletion request is untouched", activeProfile?.first_name === "Active", activeProfile);
  check("C14 an active account keeps its standing", activeProfile?.account_status === "active", activeProfile);

  /* ============ D. Idempotency ============ */

  const rerun = await purgeRequest({ authorization: `Bearer ${TEST_SECRET}` });
  check("D1 the purge can be run repeatedly", rerun.status === 200, rerun);
  check("D2 a repeat run purges nothing new", rerun.body.ok === true && (rerun.body as { purged: number }).purged === 0, rerun.body);
  const victimAfter = await deletionRow(victim.id);
  check("D3 an already-purged request is not re-processed", victimAfter?.status === "completed", victimAfter);
  check(
    "D4 the completion timestamp is not rewritten",
    victimAfter?.processed_at === victimRequest?.processed_at,
    victimAfter,
  );
  const prematureAfter = await profileRow(premature.id);
  check("D5 repeated runs never widen the work set", prematureAfter?.first_name === "Premature", prematureAfter);

  /* ============ E. Cross-user purge attempts ============ */

  const forgeOther = await member.client
    .from("account_deletion_requests")
    .insert({
      profile_id: premature.id,
      status: "pending",
      scheduled_purge_at: daysAgo(1),
      requested_at: daysAgo(40),
    });
  check("E1 a member cannot file a deletion request for another account", Boolean(forgeOther.error), forgeOther.error?.code);

  const backdateOther = await member.client
    .from("account_deletion_requests")
    .update({ scheduled_purge_at: daysAgo(1) })
    .eq("profile_id", premature.id)
    .select();
  check(
    "E2 a member cannot backdate another account's purge date",
    Boolean(backdateOther.error) || (backdateOther.data ?? []).length === 0,
    backdateOther.data,
  );

  const readOther = await member.client
    .from("account_deletion_requests")
    .select("profile_id")
    .eq("profile_id", premature.id);
  check("E3 a member cannot read another account's deletion request", (readOther.data ?? []).length === 0, readOther.data);

  const deleteOther = await member.client
    .from("account_deletion_requests")
    .delete()
    .eq("profile_id", premature.id)
    .select();
  check(
    "E4 a member cannot delete another account's deletion request",
    Boolean(deleteOther.error) || (deleteOther.data ?? []).length === 0,
    deleteOther.data,
  );

  const scrubOther = await member.client
    .from("profiles")
    .update({ first_name: null, deleted_at: daysAgo(40) })
    .eq("id", premature.id)
    .select();
  check(
    "E5 a member cannot mark another account as deleted",
    Boolean(scrubOther.error) || (scrubOther.data ?? []).length === 0,
    scrubOther.data,
  );
  const untouched = await profileRow(premature.id);
  check("E6 the targeted account survived every cross-user attempt", untouched?.first_name === "Premature", untouched);

  /* ============ F. Billing ledger guard trigger ============ */

  const anonGuard = await anon.rpc("guard_billing_event_mutation" as never);
  check("F1 a visitor cannot execute the ledger guard function", Boolean(anonGuard.error), anonGuard.error?.code);

  const memberGuard = await member.client.rpc("guard_billing_event_mutation" as never);
  check("F2 a signed-in member cannot execute the ledger guard function", Boolean(memberGuard.error), memberGuard.error?.code);

  const guardEvent = `purge-audit-${stamp}`;
  const insertEvent = await admin.from("billing_events").insert({
    provider: "mock",
    provider_event_id: guardEvent,
    event_type: "audit.guard",
    status: "received",
    signature_verified: true,
    payload_summary: {},
  });
  check("F3 the scheduler can still write a ledger row", !insertEvent.error, insertEvent.error?.message);

  const mutateEvent = await admin
    .from("billing_events")
    .update({ event_type: "audit.tampered" })
    .eq("provider_event_id", guardEvent)
    .select();
  check(
    "F4 the guard trigger still refuses a ledger mutation",
    Boolean(mutateEvent.error) || (mutateEvent.data ?? []).length === 0,
    mutateEvent.error?.message,
  );

  const deleteEvent = await admin
    .from("billing_events")
    .delete()
    .eq("provider_event_id", guardEvent)
    .select();
  check(
    "F5 the guard trigger still refuses a ledger deletion",
    Boolean(deleteEvent.error) || (deleteEvent.data ?? []).length === 0,
    deleteEvent.error?.message,
  );

  const stillThere = await admin
    .from("billing_events")
    .select("event_type")
    .eq("provider_event_id", guardEvent)
    .maybeSingle();
  check("F6 the ledger row is intact and unaltered", stillThere.data?.event_type === "audit.guard", stillThere.data);

  const memberLedger = await member.client.from("billing_events").select("id").limit(1);
  check(
    "F7 members still cannot read the ledger the guard protects",
    Boolean(memberLedger.error) || (memberLedger.data ?? []).length === 0,
    memberLedger.data,
  );

  /* ============ G. Rate limiting ============ */

  let limited = false;
  for (let i = 0; i < 8; i += 1) {
    const outcome = await purgeRequest({ authorization: `Bearer ${TEST_SECRET}` });
    if (outcome.status === 429) {
      limited = true;
      break;
    }
  }
  check("G1 repeated scheduled purges are rate limited", limited);
  const afterLimit = await profileRow(premature.id);
  check("G2 rate limiting never damages account data", afterLimit?.first_name === "Premature", afterLimit);

  if (originalSecret === undefined) delete process.env["ACCOUNT_PURGE_SECRET"];
  else process.env["ACCOUNT_PURGE_SECRET"] = originalSecret;

  await cleanup();

  console.log(`\nMaintenance purge & ledger-guard suite: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch(async (error) => {
  console.error(error);
  await cleanup();
  process.exit(1);
});
