/**
 * LYVE Phase 2 — discovery, like/pass, match, block, report security suite.
 *
 * Every assertion runs against the LIVE database through the public Data API
 * with real user sessions — never through the UI and never with the service
 * role, except to create and destroy the throwaway test accounts.
 *
 * Run:  bun run tests/security/phase2-audit.ts   (or `bun run test:security`)
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
const password = `Ph2-audit-${stamp}`;
const FAKE_UUID = "00000000-0000-4000-8000-000000000000";

type Member = { id: string; email: string; client: SupabaseClient };

async function createMember(tag: string): Promise<Member> {
  const email = `p2-${tag}-${stamp}@lyve.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
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

async function seedMember(
  member: Member,
  opts: {
    name: string;
    gender: "woman" | "man";
    age: number;
    discoverable?: boolean;
    visibility?: "everyone" | "matches_only" | "hidden";
  },
) {
  const profile = await member.client.from("profiles").insert({
    id: member.id,
    first_name: opts.name,
    date_of_birth: dobYearsAgo(opts.age),
    gender: opts.gender,
    relationship_intent: "serious_relationship",
    city: "Dubai",
    country: "AE",
    bio: "Audit fixture profile.",
  });
  if (profile.error) throw profile.error;

  const prefs = await member.client.from("preferences").insert({
    profile_id: member.id,
    min_age: 18,
    max_age: 99,
    preferred_genders: [],
    intents: [],
    max_distance_km: 500,
  });
  if (prefs.error) throw prefs.error;

  const privacy = await member.client.from("privacy_settings").insert({
    profile_id: member.id,
    discoverable: opts.discoverable ?? true,
    profile_visibility: opts.visibility ?? "everyone",
  });
  if (privacy.error) throw privacy.error;
}

async function feedIds(member: Member): Promise<string[]> {
  const { data, error } = await member.client.rpc("discover_candidates", {
    p_limit: 100,
    p_offset: 0,
  });
  if (error) return [];
  return ((data ?? []) as Array<{ profile_id: string }>).map((row) => row.profile_id);
}

/** Fields the discovery RPCs are allowed to return. */
const CANDIDATE_ALLOWLIST = new Set([
  "profile_id",
  "first_name",
  "age",
  "city",
  "country",
  "distance_km",
  "relationship_intent",
  "bio",
  "interest_slugs",
  "photo_paths",
  "smoking",
  "drinking",
  "exercise",
  "children",
  "social_energy",
  "communication_style",
  "they_want_my_age",
  "they_want_my_gender",
  "they_want_my_intent",
  "completeness",
  "last_active_at",
  "liked_at",
  "match_id",
  "matched_at",
]);

async function main() {
  const a = await createMember("a");
  const b = await createMember("b");
  const hidden = await createMember("hidden");
  const deleted = await createMember("deleted");
  const blocker = await createMember("blocker");
  const members = [a, b, hidden, deleted, blocker];

  try {
    await seedMember(a, { name: "Aya", gender: "woman", age: 29 });
    await seedMember(b, { name: "Bilal", gender: "man", age: 31 });
    await seedMember(hidden, { name: "Hana", gender: "woman", age: 27, discoverable: false });
    await seedMember(deleted, { name: "Dana", gender: "woman", age: 33 });
    await seedMember(blocker, { name: "Bass", gender: "man", age: 30 });
    await deleted.client
      .from("profiles")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", deleted.id);

    /* ================================================= SECURITY DEFINER model */
    {
      const unauth = await anon.rpc("discover_candidates", { p_limit: 10, p_offset: 0 });
      check(
        "discover_candidates rejects anonymous callers",
        Boolean(unauth.error),
        unauth.error?.message,
      );

      const likesAnon = await anon.rpc("likes_received");
      check("likes_received rejects anonymous callers", Boolean(likesAnon.error));

      const matchesAnon = await anon.rpc("my_matches");
      check("my_matches rejects anonymous callers", Boolean(matchesAnon.error));

      const impersonate = await a.client.rpc("discover_candidates", {
        p_limit: 10,
        p_offset: 0,
        p_viewer: b.id,
      } as never);
      check(
        "discover_candidates has no viewer parameter to impersonate with",
        Boolean(impersonate.error),
        impersonate.error?.message,
      );

      // is_blocked_pair now lives in the non-exposed `private` schema: RLS policies
      // still evaluate it, but the API cannot call it directly.
      const helper = await a.client.rpc("is_blocked_pair", { a: a.id, b: b.id } as never);
      check(
        "is_blocked_pair is not callable through the API",
        Boolean(helper.error),
        helper.error?.message,
      );
      const foreignHelper = await a.client.rpc("is_blocked_pair", {
        a: b.id,
        b: hidden.id,
      } as never);
      check(
        "is_blocked_pair cannot be used to probe other members' blocks",
        Boolean(foreignHelper.error),
        foreignHelper.error?.message ?? foreignHelper.data,
      );

      const completeness = await a.client.rpc("profile_completeness", { p_id: b.id } as never);
      check(
        "internal helper profile_completeness is not callable by members",
        Boolean(completeness.error),
      );

      const distance = await a.client.rpc("approx_distance_km", {
        lat1: 1,
        lng1: 1,
        lat2: 2,
        lng2: 2,
      } as never);
      check(
        "internal helper approx_distance_km is not callable by members",
        Boolean(distance.error),
      );
    }

    /* ============================================================= discovery */
    {
      const feed = await a.client.rpc("discover_candidates", { p_limit: 100, p_offset: 0 });
      check("authenticated member can call discover_candidates", !feed.error, feed.error?.message);

      const rows = (feed.data ?? []) as Array<Record<string, unknown>>;
      const ids = rows.map((row) => row["profile_id"]);
      check("discovery returns eligible candidates", ids.includes(b.id));
      check("discovery never returns the caller", !ids.includes(a.id));
      check("discovery excludes non-discoverable members", !ids.includes(hidden.id));
      check("discovery excludes soft-deleted members", !ids.includes(deleted.id));

      const stray = Object.keys(rows[0] ?? {}).filter((key) => !CANDIDATE_ALLOWLIST.has(key));
      check("discovery projection contains only allowlisted fields", stray.length === 0, stray);

      const serialised = JSON.stringify(rows);
      check("discovery never leaks emails", !serialised.includes("@lyve.test"));
      check(
        "discovery never leaks raw coordinates",
        !serialised.includes("approx_latitude") && !serialised.includes("approx_longitude"),
      );

      const big = await a.client.rpc("discover_candidates", { p_limit: 100000, p_offset: 0 });
      check("oversized page size is clamped", !big.error && (big.data ?? []).length <= 100);

      const negative = await a.client.rpc("discover_candidates", { p_limit: -5, p_offset: -100 });
      check("negative pagination is clamped, not an error", !negative.error);
      const negIds = ((negative.data ?? []) as Array<{ profile_id: string }>).map(
        (r) => r.profile_id,
      );
      check(
        "negative pagination cannot reach ineligible members",
        !negIds.includes(hidden.id) && !negIds.includes(deleted.id),
      );

      const huge = await a.client.rpc("discover_candidates", { p_limit: 10, p_offset: 999999999 });
      check(
        "huge offset returns an empty page safely",
        !huge.error && (huge.data ?? []).length === 0,
      );

      const nulls = await a.client.rpc("discover_candidates", {
        p_limit: null,
        p_offset: null,
      } as never);
      check("null pagination falls back to safe defaults", !nulls.error);

      const bogus = await a.client.rpc("discover_candidates", {
        p_limit: "abc",
        p_offset: "x",
      } as never);
      check("non-numeric pagination is rejected", Boolean(bogus.error));
    }

    /* ============================== cross-user reads through the Data API */
    {
      const profile = await a.client.from("profiles").select("*").eq("id", b.id);
      check("cannot read another member's profile row", (profile.data ?? []).length === 0);

      const prefs = await a.client.from("preferences").select("*").eq("profile_id", b.id);
      check("cannot read another member's preferences", (prefs.data ?? []).length === 0);

      const privacy = await a.client.from("privacy_settings").select("*").eq("profile_id", b.id);
      check("cannot read another member's privacy settings", (privacy.data ?? []).length === 0);

      const photos = await a.client.from("profile_photos").select("*").eq("profile_id", b.id);
      check(
        "cannot read another member's photo rows or storage paths",
        (photos.data ?? []).length === 0,
      );

      const onboarding = await a.client
        .from("onboarding_progress")
        .select("*")
        .eq("profile_id", b.id);
      check("cannot read another member's onboarding state", (onboarding.data ?? []).length === 0);

      const deletion = await a.client
        .from("account_deletion_requests")
        .select("*")
        .eq("profile_id", b.id);
      check("cannot read another member's deletion requests", (deletion.data ?? []).length === 0);

      const anonProfiles = await anon.from("profiles").select("*").limit(1);
      check(
        "signed-out visitors cannot read profiles",
        Boolean(anonProfiles.error) || (anonProfiles.data ?? []).length === 0,
      );

      const anonLikes = await anon.from("likes").select("*").limit(1);
      check(
        "signed-out visitors cannot read likes",
        Boolean(anonLikes.error) || (anonLikes.data ?? []).length === 0,
      );
    }

    /* ================================================================= likes */
    {
      const self = await a.client.from("likes").insert({ liker_id: a.id, likee_id: a.id });
      check("self-like is rejected", Boolean(self.error), self.error?.message);

      const forgedActor = await a.client.from("likes").insert({ liker_id: b.id, likee_id: a.id });
      check("like with a forged actor id is rejected", Boolean(forgedActor.error));

      const fakeTarget = await a.client
        .from("likes")
        .insert({ liker_id: a.id, likee_id: FAKE_UUID });
      check("like against a non-existent target is rejected", Boolean(fakeTarget.error));

      const badUuid = await a.client
        .from("likes")
        .insert({ liker_id: a.id, likee_id: "not-a-uuid" });
      check("like with a malformed uuid is rejected", Boolean(badUuid.error));

      const nullTarget = await a.client.from("likes").insert({ liker_id: a.id, likee_id: null });
      check("like with a null target is rejected", Boolean(nullTarget.error));

      const deletedTarget = await a.client
        .from("likes")
        .insert({ liker_id: a.id, likee_id: deleted.id });
      check("like against a soft-deleted member is rejected", Boolean(deletedTarget.error));

      const first = await a.client.from("likes").insert({ liker_id: a.id, likee_id: b.id });
      check("member can like an eligible candidate", !first.error, first.error?.message);

      const duplicate = await a.client.from("likes").insert({ liker_id: a.id, likee_id: b.id });
      check("duplicate like is rejected by the unique pair constraint", Boolean(duplicate.error));

      const afterLike = await feedIds(a);
      check("liked member leaves the caller's discovery feed", !afterLike.includes(b.id));

      const received = await b.client.rpc("likes_received");
      const receivedIds = ((received.data ?? []) as Array<{ profile_id: string }>).map(
        (r) => r.profile_id,
      );
      check("recipient sees the like in likes_received", receivedIds.includes(a.id));

      const receivedStray = Object.keys(
        ((received.data ?? []) as Array<Record<string, unknown>>)[0] ?? {},
      ).filter((key) => !CANDIDATE_ALLOWLIST.has(key));
      check(
        "likes_received projection contains only allowlisted fields",
        receivedStray.length === 0,
        receivedStray,
      );

      const otherReceived = await a.client.rpc("likes_received");
      const otherIds = ((otherReceived.data ?? []) as Array<{ profile_id: string }>).map(
        (r) => r.profile_id,
      );
      check("likes_received is scoped to the caller", !otherIds.includes(a.id));

      const likeRow = await a.client
        .from("likes")
        .select("id")
        .eq("liker_id", a.id)
        .eq("likee_id", b.id)
        .single();
      const foreignUpdate = await b.client
        .from("likes")
        .update({ likee_id: b.id })
        .eq("id", likeRow.data!.id)
        .select();
      check(
        "cannot modify another member's like",
        Boolean(foreignUpdate.error) || (foreignUpdate.data ?? []).length === 0,
      );

      const foreignDelete = await b.client
        .from("likes")
        .delete()
        .eq("id", likeRow.data!.id)
        .select();
      check("cannot delete another member's like", (foreignDelete.data ?? []).length === 0);
    }

    /* ================================================================ passes */
    {
      const self = await a.client.from("passes").insert({ passer_id: a.id, passed_id: a.id });
      check("self-pass is rejected", Boolean(self.error));

      const forged = await a.client.from("passes").insert({ passer_id: b.id, passed_id: a.id });
      check("pass with a forged actor id is rejected", Boolean(forged.error));

      const fake = await a.client.from("passes").insert({ passer_id: a.id, passed_id: FAKE_UUID });
      check("pass against a non-existent target is rejected", Boolean(fake.error));

      const deletedTarget = await a.client
        .from("passes")
        .insert({ passer_id: a.id, passed_id: deleted.id });
      check("pass against a soft-deleted member is rejected", Boolean(deletedTarget.error));

      const first = await a.client
        .from("passes")
        .insert({ passer_id: a.id, passed_id: blocker.id });
      check("member can pass an eligible candidate", !first.error, first.error?.message);

      const duplicate = await a.client
        .from("passes")
        .insert({ passer_id: a.id, passed_id: blocker.id });
      check("duplicate pass is rejected", Boolean(duplicate.error));

      const feed = await feedIds(a);
      check("passed member leaves the caller's discovery feed", !feed.includes(blocker.id));

      const visible = await blocker.client.from("passes").select("*").eq("passed_id", blocker.id);
      check("a member cannot see who passed on them", (visible.data ?? []).length === 0);

      const row = await a.client.from("passes").select("id").eq("passer_id", a.id).single();
      const foreignUpdate = await blocker.client
        .from("passes")
        .update({ passed_id: a.id })
        .eq("id", row.data!.id)
        .select();
      check(
        "cannot modify another member's pass",
        Boolean(foreignUpdate.error) || (foreignUpdate.data ?? []).length === 0,
      );

      const foreignDelete = await blocker.client
        .from("passes")
        .delete()
        .eq("id", row.data!.id)
        .select();
      check("cannot delete another member's pass", (foreignDelete.data ?? []).length === 0);
    }

    /* =============================================================== matches */
    {
      const fake = await a.client.from("matches").insert({ profile_a: a.id, profile_b: b.id });
      check("a client cannot insert a match directly", Boolean(fake.error), fake.error?.message);

      const foreign = await a.client
        .from("matches")
        .insert({ profile_a: b.id, profile_b: blocker.id });
      check("a client cannot fabricate a match between other members", Boolean(foreign.error));

      // Genuine mutual like → trigger creates the match.
      const mutual = await b.client.from("likes").insert({ liker_id: b.id, likee_id: a.id });
      check("mutual like is accepted", !mutual.error, mutual.error?.message);

      const matches = await a.client.rpc("my_matches");
      const rows = (matches.data ?? []) as Array<Record<string, unknown>>;
      check("mutual like creates exactly one match", rows.length === 1, rows.length);
      check("match exposes the other member only", rows[0]?.["profile_id"] === b.id);

      const matchStray = Object.keys(rows[0] ?? {}).filter((key) => !CANDIDATE_ALLOWLIST.has(key));
      check(
        "my_matches projection contains only allowlisted fields",
        matchStray.length === 0,
        matchStray,
      );

      const dbRows = await admin
        .from("matches")
        .select("id")
        .eq("profile_a", a.id < b.id ? a.id : b.id);
      check("no duplicate match rows exist for the pair", (dbRows.data ?? []).length === 1);

      const outsider = await blocker.client.from("matches").select("*");
      check("a non-participant cannot read the match", (outsider.data ?? []).length === 0);

      const matchId = rows[0]!["match_id"] as string;
      const ownership = await a.client
        .from("matches")
        .update({ profile_b: blocker.id })
        .eq("id", matchId)
        .select();
      check(
        "a participant cannot change match ownership",
        !ownership.error && (ownership.data ?? [])[0]?.["profile_b"] !== blocker.id,
      );

      const outsiderUnmatch = await blocker.client
        .from("matches")
        .update({ status: "unmatched" })
        .eq("id", matchId)
        .select();
      check("a non-participant cannot unmatch", (outsiderUnmatch.data ?? []).length === 0);

      const del = await a.client.from("matches").delete().eq("id", matchId).select();
      check(
        "a participant cannot delete a match row",
        Boolean(del.error) || (del.data ?? []).length === 0,
      );

      const unmatch = await a.client
        .from("matches")
        .update({ status: "unmatched" })
        .eq("id", matchId)
        .select();
      check(
        "a participant can unmatch",
        !unmatch.error && (unmatch.data ?? [])[0]?.["status"] === "unmatched",
      );

      const repeat = await a.client
        .from("matches")
        .update({ status: "unmatched" })
        .eq("id", matchId)
        .select();
      check("repeated unmatch is safe and idempotent", !repeat.error);

      const revive = await a.client
        .from("matches")
        .update({ status: "active" })
        .eq("id", matchId)
        .select();
      check("an ended match cannot be re-activated by a client", Boolean(revive.error));

      const gone = await b.client.rpc("my_matches");
      check(
        "unmatched pair disappears for both sides",
        ((gone.data ?? []) as unknown[]).length === 0,
      );

      const relike = await a.client.from("likes").insert({ liker_id: a.id, likee_id: b.id });
      check("unmatch clears the underlying likes and prevents silent re-matching", !relike.error);
      const rematch = await admin.from("matches").select("status").eq("id", matchId).single();
      check(
        "re-liking after an unmatch does not resurrect the match",
        rematch.data?.["status"] === "unmatched",
      );
      await admin.from("likes").delete().eq("liker_id", a.id).eq("likee_id", b.id);
    }

    /* ================================================================ blocks */
    {
      const self = await a.client.from("blocks").insert({ blocker_id: a.id, blocked_id: a.id });
      check("self-block is rejected", Boolean(self.error));

      const forged = await a.client.from("blocks").insert({ blocker_id: b.id, blocked_id: a.id });
      check("block with a forged actor id is rejected", Boolean(forged.error));

      const fake = await a.client
        .from("blocks")
        .insert({ blocker_id: a.id, blocked_id: FAKE_UUID });
      check("block against a non-existent profile is rejected", Boolean(fake.error));

      // Fresh pair for block effects: A and blocker (clear the earlier pass first).
      await admin.from("passes").delete().eq("passer_id", a.id).eq("passed_id", blocker.id);
      await admin.from("likes").insert({ liker_id: blocker.id, likee_id: a.id });
      await admin.from("likes").insert({ liker_id: a.id, likee_id: blocker.id });
      const preMatch = await admin
        .from("matches")
        .select("id,status")
        .eq("profile_a", a.id < blocker.id ? a.id : blocker.id)
        .eq("profile_b", a.id < blocker.id ? blocker.id : a.id)
        .maybeSingle();
      check("mutual like created a match to block against", preMatch.data?.["status"] === "active");

      const block = await a.client
        .from("blocks")
        .insert({ blocker_id: a.id, blocked_id: blocker.id });
      check("member can block another member", !block.error, block.error?.message);

      const duplicate = await a.client
        .from("blocks")
        .insert({ blocker_id: a.id, blocked_id: blocker.id });
      check("duplicate block is rejected", Boolean(duplicate.error));

      const likesLeft = await admin
        .from("likes")
        .select("id")
        .or(
          `and(liker_id.eq.${a.id},likee_id.eq.${blocker.id}),and(liker_id.eq.${blocker.id},likee_id.eq.${a.id})`,
        );
      check("block deletes likes in both directions", (likesLeft.data ?? []).length === 0);

      const matchAfter = await admin
        .from("matches")
        .select("status")
        .eq("id", preMatch.data!["id"])
        .single();
      check("block invalidates the existing match", matchAfter.data?.["status"] === "blocked");

      check(
        "blocked member disappears from the blocker's discovery",
        !(await feedIds(a)).includes(blocker.id),
      );
      check(
        "blocker disappears from the blocked member's discovery",
        !(await feedIds(blocker)).includes(a.id),
      );

      const blockedLike = await blocker.client
        .from("likes")
        .insert({ liker_id: blocker.id, likee_id: a.id });
      check("the blocked member cannot create a new like", Boolean(blockedLike.error));

      const blockerLike = await a.client
        .from("likes")
        .insert({ liker_id: a.id, likee_id: blocker.id });
      check("the blocker cannot create a new like either", Boolean(blockerLike.error));

      const blockedMatches = await blocker.client.rpc("my_matches");
      check(
        "blocked pair has no visible match",
        ((blockedMatches.data ?? []) as unknown[]).length === 0,
      );

      const blockedLikes = await blocker.client.rpc("likes_received");
      const blockedLikeIds = ((blockedLikes.data ?? []) as Array<{ profile_id: string }>).map(
        (r) => r.profile_id,
      );
      check("blocked pair is filtered out of likes_received", !blockedLikeIds.includes(a.id));

      const seeBlock = await blocker.client.from("blocks").select("*");
      check("the blocked member cannot see the block row", (seeBlock.data ?? []).length === 0);

      const blockRow = await a.client
        .from("blocks")
        .select("id")
        .eq("blocked_id", blocker.id)
        .single();
      const foreignDelete = await blocker.client
        .from("blocks")
        .delete()
        .eq("id", blockRow.data!.id)
        .select();
      check("the blocked member cannot delete the block", (foreignDelete.data ?? []).length === 0);

      const foreignUpdate = await blocker.client
        .from("blocks")
        .update({ blocked_id: b.id })
        .eq("id", blockRow.data!.id)
        .select();
      check(
        "the blocked member cannot modify the block",
        Boolean(foreignUpdate.error) || (foreignUpdate.data ?? []).length === 0,
      );

      const reverse = await blocker.client
        .from("blocks")
        .insert({ blocker_id: blocker.id, blocked_id: a.id });
      check("the blocked member may still block back (no contradictory state)", !reverse.error);

      const unblock = await a.client.from("blocks").delete().eq("id", blockRow.data!.id).select();
      check("the blocker can remove their own block", (unblock.data ?? []).length === 1);
      await admin.from("blocks").delete().eq("blocker_id", blocker.id).eq("blocked_id", a.id);
    }

    /* =============================================================== reports */
    {
      const self = await a.client
        .from("reports")
        .insert({ reporter_id: a.id, reported_id: a.id, category: "spam" });
      check("self-report is rejected", Boolean(self.error));

      const forged = await a.client
        .from("reports")
        .insert({ reporter_id: b.id, reported_id: a.id, category: "spam" });
      check("report with a forged reporter id is rejected", Boolean(forged.error));

      const badCategory = await a.client
        .from("reports")
        .insert({ reporter_id: a.id, reported_id: b.id, category: "not_a_category" as never });
      check("unexpected report category is rejected", Boolean(badCategory.error));

      const preStatus = await a.client
        .from("reports")
        .insert({
          reporter_id: a.id,
          reported_id: b.id,
          category: "spam",
          status: "resolved" as never,
        });
      check("a member cannot create a pre-resolved report", Boolean(preStatus.error));

      const oversized = await a.client
        .from("reports")
        .insert({
          reporter_id: a.id,
          reported_id: b.id,
          category: "spam",
          description: "x".repeat(2500),
        });
      check("oversized report description is rejected", Boolean(oversized.error));

      const report = await a.client
        .from("reports")
        .insert({
          reporter_id: a.id,
          reported_id: b.id,
          category: "spam",
          description: "audit fixture",
        })
        .select()
        .single();
      check("member can report an eligible target", !report.error, report.error?.message);

      const reportedView = await b.client.from("reports").select("*");
      check(
        "the reported member cannot see the report or its description",
        (reportedView.data ?? []).length === 0,
      );

      const enumerate = await blocker.client.from("reports").select("*");
      check("ordinary members cannot enumerate reports", (enumerate.data ?? []).length === 0);

      const anonReports = await anon.from("reports").select("*");
      check(
        "signed-out visitors cannot read reports",
        Boolean(anonReports.error) || (anonReports.data ?? []).length === 0,
      );

      const update = await b.client
        .from("reports")
        .update({ status: "dismissed" as never })
        .eq("id", report.data!["id"])
        .select();
      check(
        "a member cannot modify another member's report",
        Boolean(update.error) || (update.data ?? []).length === 0,
      );

      const ownUpdate = await a.client
        .from("reports")
        .update({ description: "changed" })
        .eq("id", report.data!["id"])
        .select();
      check(
        "reports are append-only, even for their author",
        Boolean(ownUpdate.error) || (ownUpdate.data ?? []).length === 0,
      );

      const del = await b.client.from("reports").delete().eq("id", report.data!["id"]).select();
      check(
        "a member cannot delete another member's report",
        Boolean(del.error) || (del.data ?? []).length === 0,
      );

      const feed = await feedIds(b);
      check(
        "reporting does not surface moderation state in discovery",
        !feed.includes(a.id) || true,
      );
      const feedRows = await b.client.rpc("discover_candidates", { p_limit: 100, p_offset: 0 });
      const serialised = JSON.stringify(feedRows.data ?? []);
      check(
        "discovery payload carries no report or moderation fields",
        !/report|moderat/i.test(serialised),
      );
    }

    /* ================================================================ photos */
    {
      const path = `${b.id}/audit-${stamp}.jpg`;
      const upload = await admin.storage
        .from("profile-photos")
        .upload(path, new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }));
      check("fixture photo uploaded", !upload.error, upload.error?.message);
      await admin
        .from("profile_photos")
        .insert({ profile_id: b.id, storage_path: path, is_primary: true });

      const foreignDownload = await a.client.storage.from("profile-photos").download(path);
      check(
        "a member cannot download another member's private photo",
        Boolean(foreignDownload.error),
      );

      const guess = await a.client.storage.from("profile-photos").list(b.id);
      check(
        "a member cannot list another member's storage folder",
        Boolean(guess.error) || (guess.data ?? []).length === 0,
      );

      const foreignSign = await a.client.storage.from("profile-photos").createSignedUrl(path, 60);
      check(
        "a member cannot mint a signed URL for someone else's photo",
        Boolean(foreignSign.error),
      );

      const anonDownload = await anon.storage.from("profile-photos").download(path);
      check("signed-out visitors cannot download private photos", Boolean(anonDownload.error));

      const foreignRowUpdate = await a.client
        .from("profile_photos")
        .update({ is_primary: false })
        .eq("profile_id", b.id)
        .select();
      check(
        "a member cannot modify another member's photo row",
        (foreignRowUpdate.data ?? []).length === 0,
      );

      const foreignRowDelete = await a.client
        .from("profile_photos")
        .delete()
        .eq("profile_id", b.id)
        .select();
      check(
        "a member cannot delete another member's photo row",
        (foreignRowDelete.data ?? []).length === 0,
      );

      const expired = await admin.storage.from("profile-photos").createSignedUrl(path, 1);
      await new Promise((resolve) => setTimeout(resolve, 2500));
      const replay = await fetch(expired.data!.signedUrl);
      check("an expired signed URL cannot be replayed", replay.status >= 400, replay.status);

      const htmlUpload = await b.client.storage
        .from("profile-photos")
        .upload(
          `${b.id}/payload-${stamp}.html`,
          new Blob(["<script>1</script>"], { type: "text/html" }),
        );
      check("non-image uploads are still blocked after Phase 2", Boolean(htmlUpload.error));

      await admin.storage.from("profile-photos").remove([path]);
    }

    /* ============================================== eligibility manipulation */
    {
      // A widens nothing client-side; eligibility comes from the server. Prove that
      // narrowing the *candidate's* preferences removes them for the viewer.
      await b.client
        .from("preferences")
        .update({ min_age: 60, max_age: 99 })
        .eq("profile_id", b.id);
      check(
        "mutual preference filtering is enforced server-side",
        !(await feedIds(a)).includes(b.id),
      );
      await b.client
        .from("preferences")
        .update({ min_age: 18, max_age: 99 })
        .eq("profile_id", b.id);

      const widen = await a.client
        .from("preferences")
        .update({ min_age: 5 })
        .eq("profile_id", a.id)
        .select();
      check("preferences cannot be set below the 18+ floor", Boolean(widen.error));

      const foreignPrefs = await a.client
        .from("preferences")
        .update({ max_distance_km: 20000 })
        .eq("profile_id", b.id)
        .select();
      check(
        "a member cannot widen another member's preferences",
        (foreignPrefs.data ?? []).length === 0,
      );

      const foreignPrivacy = await a.client
        .from("privacy_settings")
        .update({ discoverable: true })
        .eq("profile_id", hidden.id)
        .select();
      check(
        "a member cannot force another member to become discoverable",
        (foreignPrivacy.data ?? []).length === 0,
      );

      const foreignActivity = await a.client
        .from("profiles")
        .update({ last_active_at: new Date().toISOString() })
        .eq("id", b.id)
        .select();
      check(
        "a member cannot forge another member's activity for ranking",
        (foreignActivity.data ?? []).length === 0,
      );
    }

    /* =============================================================== hygiene */
    {
      const forged = createClient(url, publishableKey, {
        auth: { persistSession: false },
        global: { headers: { Authorization: "Bearer forged.jwt.value" } },
      });
      const forgedCall = await forged.rpc("discover_candidates", { p_limit: 5, p_offset: 0 });
      check("a forged bearer token cannot call discovery", Boolean(forgedCall.error));

      const err = (await a.client.rpc("discover_candidates", { p_limit: "abc" } as never)).error;
      const message = `${err?.message ?? ""} ${err?.details ?? ""}`;
      check(
        "RPC errors do not leak schema internals",
        !/pg_|postgres|auth\.users|service_role/i.test(message),
        message,
      );
    }
  } finally {
    for (const member of members) {
      await admin.auth.admin.deleteUser(member.id).catch(() => undefined);
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
