/**
 * LYVE Phase 3 — messaging, conversations, realtime and reporting security suite.
 *
 * Every assertion runs against the LIVE database through the public Data API
 * with real user sessions. The service role is used only to create and destroy
 * throwaway accounts and to observe ground truth.
 *
 * Run:  bun run tests/security/phase3-audit.ts   (or `bun run test:security`)
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { heuristicScreener } from "../../src/lib/moderation";
import { toChatMessage, mergeMessages, MESSAGE_PAGE_SIZE } from "../../src/lib/messaging-core";

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
const password = `Ph3-audit-${stamp}`;
const FAKE_UUID = "00000000-0000-4000-8000-000000000000";

type Member = { id: string; email: string; client: SupabaseClient };

async function createMember(tag: string): Promise<Member> {
  const email = `p3-${tag}-${stamp}@lyve.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
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

async function seedMember(member: Member, name: string, gender: "woman" | "man") {
  const profile = await member.client.from("profiles").insert({
    id: member.id,
    first_name: name,
    date_of_birth: dobYearsAgo(29),
    gender,
    relationship_intent: "serious_relationship",
    city: "Dubai",
    country: "AE",
    bio: "Phase 3 audit fixture profile.",
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
    discoverable: true,
    profile_visibility: "everyone",
  });
  if (privacy.error) throw privacy.error;
}

/** Mutual like → match trigger → conversation trigger. Returns the conversation id. */
async function matchPair(a: Member, b: Member): Promise<{ matchId: string; conversationId: string }> {
  const first = await a.client.from("likes").insert({ liker_id: a.id, likee_id: b.id });
  if (first.error) throw first.error;
  const second = await b.client.from("likes").insert({ liker_id: b.id, likee_id: a.id });
  if (second.error) throw second.error;
  const lo = a.id < b.id ? a.id : b.id;
  const hi = a.id < b.id ? b.id : a.id;
  const { data, error } = await admin
    .from("conversations")
    .select("id, match_id")
    .eq("profile_a", lo)
    .eq("profile_b", hi)
    .single();
  if (error) throw error;
  return { matchId: data!["match_id"] as string, conversationId: data!["id"] as string };
}

async function send(member: Member, conversationId: string, body: string) {
  return member.client
    .from("messages")
    .insert({ conversation_id: conversationId, sender_id: member.id, message_type: "text", body })
    .select()
    .single();
}

/** Fields the messaging surface is allowed to expose to the browser. */
const MESSAGE_ALLOWLIST = new Set(["id", "conversationId", "senderId", "type", "body", "deletedAt", "createdAt"]);

async function main() {
  const members: Member[] = [];
  try {
    const a = await createMember("a");
    const b = await createMember("b");
    const outsider = await createMember("outsider");
    const blockA = await createMember("blocka");
    const blockB = await createMember("blockb");
    const unmatchA = await createMember("unmatcha");
    const unmatchB = await createMember("unmatchb");
    members.push(a, b, outsider, blockA, blockB, unmatchA, unmatchB);

    await seedMember(a, "Amina", "woman");
    await seedMember(b, "Daniel", "man");
    await seedMember(outsider, "Marco", "man");
    await seedMember(blockA, "Leila", "woman");
    await seedMember(blockB, "Omar", "man");
    await seedMember(unmatchA, "Nour", "woman");
    await seedMember(unmatchB, "Sami", "man");

    const pair = await matchPair(a, b);

    /* ============================================ conversation provisioning */
    {
      check("a mutual match automatically provisions exactly one conversation", Boolean(pair.conversationId));

      const { count } = await admin
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("match_id", pair.matchId);
      check("a match can never have two conversations", count === 1, count);

      const members2 = await admin.from("conversation_members").select("profile_id").eq("conversation_id", pair.conversationId);
      const ids = (members2.data ?? []).map((r) => r["profile_id"]).sort();
      check("both matched members are enrolled, and only them", ids.length === 2 && ids.includes(a.id) && ids.includes(b.id));

      const forge = await outsider.client
        .from("conversations")
        .insert({ match_id: pair.matchId, profile_a: outsider.id, profile_b: a.id })
        .select();
      check("a member cannot create a conversation directly", Boolean(forge.error) || (forge.data ?? []).length === 0);

      const forgeMember = await outsider.client
        .from("conversation_members")
        .insert({ conversation_id: pair.conversationId, profile_id: outsider.id })
        .select();
      check("a member cannot enroll themselves into someone else's conversation", Boolean(forgeMember.error) || (forgeMember.data ?? []).length === 0);

      const dropMember = await b.client.from("conversation_members").delete().eq("conversation_id", pair.conversationId).select();
      check("a member cannot remove the other member from a conversation", Boolean(dropMember.error) || (dropMember.data ?? []).length === 0);

      const editConv = await a.client
        .from("conversations")
        .update({ profile_b: outsider.id })
        .eq("id", pair.conversationId)
        .select();
      check("conversation participants are immutable from the client", Boolean(editConv.error) || (editConv.data ?? []).length === 0);

      const delConv = await a.client.from("conversations").delete().eq("id", pair.conversationId).select();
      check("a member cannot delete a conversation", Boolean(delConv.error) || (delConv.data ?? []).length === 0);
    }

    /* ================================================ membership visibility */
    {
      const own = await a.client.from("conversations").select("*").eq("id", pair.conversationId);
      check("a member can read their own conversation", (own.data ?? []).length === 1, own.error?.message);

      const foreign = await outsider.client.from("conversations").select("*").eq("id", pair.conversationId);
      check("a non-member cannot read the conversation row", (foreign.data ?? []).length === 0);

      const enumerate = await outsider.client.from("conversations").select("*");
      check("a member cannot enumerate all conversations", (enumerate.data ?? []).length === 0);

      const foreignMembers = await outsider.client.from("conversation_members").select("*").eq("conversation_id", pair.conversationId);
      check("a non-member cannot read the membership list", (foreignMembers.data ?? []).length === 0);

      const anonConv = await anon.from("conversations").select("*");
      check("signed-out visitors cannot read conversations", Boolean(anonConv.error) || (anonConv.data ?? []).length === 0);

      const anonMsg = await anon.from("messages").select("*");
      check("signed-out visitors cannot read messages", Boolean(anonMsg.error) || (anonMsg.data ?? []).length === 0);

      const anonInsert = await anon.from("messages").insert({
        conversation_id: pair.conversationId,
        sender_id: a.id,
        message_type: "text",
        body: "anon injection",
      }).select();
      check("signed-out visitors cannot send messages", Boolean(anonInsert.error) || (anonInsert.data ?? []).length === 0);
    }

    /* ============================================================= messages */
    let firstMessageId = "";
    {
      const sent = await send(a, pair.conversationId, "Hello from the audit fixture.");
      check("a matched member can send a message", !sent.error, sent.error?.message);
      firstMessageId = (sent.data?.["id"] as string) ?? "";

      const receiverView = await b.client.from("messages").select("*").eq("conversation_id", pair.conversationId);
      check("the other member receives the message", (receiverView.data ?? []).length === 1);

      const outsiderView = await outsider.client.from("messages").select("*").eq("conversation_id", pair.conversationId);
      check("a non-member cannot read the thread", (outsiderView.data ?? []).length === 0);

      const outsiderById = await outsider.client.from("messages").select("*").eq("id", firstMessageId);
      check("a non-member cannot read a message by guessed id", (outsiderById.data ?? []).length === 0);

      const outsiderSend = await send(outsider, pair.conversationId, "Injected by an outsider.");
      check("a non-member cannot send into the conversation", Boolean(outsiderSend.error));

      const spoof = await b.client
        .from("messages")
        .insert({ conversation_id: pair.conversationId, sender_id: a.id, message_type: "text", body: "Spoofed sender." })
        .select()
        .single();
      check("sender_id is server-assigned, so a member cannot impersonate the other", !spoof.error && spoof.data?.["sender_id"] === b.id, spoof.error?.message);

      const empty = await send(a, pair.conversationId, "   ");
      check("blank messages are rejected", Boolean(empty.error));

      const tooLong = await send(a, pair.conversationId, "x".repeat(4001));
      check("messages longer than 4000 characters are rejected", Boolean(tooLong.error));

      const atLimit = await send(a, pair.conversationId, "y".repeat(4000));
      check("a message exactly at the 4000 character limit is accepted", !atLimit.error, atLimit.error?.message);

      const forgedTimestamp = await a.client
        .from("messages")
        .insert({
          conversation_id: pair.conversationId,
          sender_id: a.id,
          message_type: "text",
          body: "Backdated attempt.",
          created_at: "2001-01-01T00:00:00Z",
        })
        .select()
        .single();
      check(
        "clients cannot backdate a message",
        !forgedTimestamp.error && new Date(forgedTimestamp.data!["created_at"] as string).getUTCFullYear() >= 2025,
        forgedTimestamp.error?.message,
      );

      const forgedModeration = await a.client
        .from("messages")
        .insert({
          conversation_id: pair.conversationId,
          sender_id: a.id,
          message_type: "text",
          body: "Pretending to be cleared.",
          moderation_status: "cleared",
          moderation_flags: ["scam"],
        } as never)
        .select()
        .single();
      check(
        "clients cannot set their own moderation verdict",
        !forgedModeration.error && forgedModeration.data?.["moderation_status"] === "unreviewed",
        forgedModeration.error?.message,
      );

      const preDeleted = await a.client
        .from("messages")
        .insert({
          conversation_id: pair.conversationId,
          sender_id: a.id,
          message_type: "text",
          body: "Born deleted.",
          deleted_at: new Date().toISOString(),
        })
        .select();
      check("a message cannot be inserted already withdrawn", Boolean(preDeleted.error) || (preDeleted.data ?? []).length === 0);
    }

    /* ============================================ immutability and withdraw */
    {
      const edit = await a.client.from("messages").update({ body: "Edited after the fact." }).eq("id", firstMessageId).select();
      check("a sent message cannot be edited, only withdrawn", Boolean(edit.error) || (edit.data ?? []).length === 0);

      const foreignEdit = await b.client.from("messages").update({ body: "Rewritten by the recipient." }).eq("id", firstMessageId).select();
      check("the recipient cannot rewrite a message they received", Boolean(foreignEdit.error) || (foreignEdit.data ?? []).length === 0);

      const foreignWithdraw = await b.client.from("messages").update({ deleted_at: new Date().toISOString() }).eq("id", firstMessageId).select();
      check("the recipient cannot withdraw the sender's message", Boolean(foreignWithdraw.error) || (foreignWithdraw.data ?? []).length === 0);

      const withdraw = await a.client
        .from("messages")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", firstMessageId)
        .select()
        .single();
      check("the sender can withdraw their own message", !withdraw.error && Boolean(withdraw.data?.["deleted_at"]), withdraw.error?.message);
      check("withdrawing scrubs the message body server-side", withdraw.data?.["body"] === null, withdraw.data?.["body"]);

      const ground = await admin.from("messages").select("body").eq("id", firstMessageId).single();
      check("the withdrawn body is gone from the database, not just hidden", ground.data?.["body"] === null);

      const revive = await a.client.from("messages").update({ deleted_at: null, body: "back" }).eq("id", firstMessageId).select();
      check("a withdrawn message cannot be revived", Boolean(revive.error) || (revive.data?.[0]?.["body"] ?? null) === null);

      const hardDelete = await a.client.from("messages").delete().eq("id", firstMessageId).select();
      check("messages cannot be hard-deleted from the client", Boolean(hardDelete.error) || (hardDelete.data ?? []).length === 0);
    }

    /* ================================================== read receipts */
    {
      const mark = await b.client.rpc("mark_conversation_read", { p_conversation: pair.conversationId });
      check("a member can mark their own conversation read", !mark.error, mark.error?.message);

      const outsiderMark = await outsider.client.rpc("mark_conversation_read", { p_conversation: pair.conversationId });
      check("a non-member cannot mark someone else's conversation read", Boolean(outsiderMark.error));

      const anonMark = await anon.rpc("mark_conversation_read", { p_conversation: pair.conversationId });
      check("signed-out visitors cannot call the read RPC", Boolean(anonMark.error));

      const selfRead = await b.client
        .from("message_reads")
        .insert({ message_id: firstMessageId, conversation_id: pair.conversationId, reader_id: a.id })
        .select();
      check("a member cannot forge a read receipt on behalf of someone else", Boolean(selfRead.error) || (selfRead.data ?? []).length === 0);

      const outsiderRead = await outsider.client.from("message_reads").select("*").eq("conversation_id", pair.conversationId);
      check("a non-member cannot read receipt rows", (outsiderRead.data ?? []).length === 0);

      const editRead = await b.client.from("message_reads").update({ read_at: "2001-01-01T00:00:00Z" }).eq("reader_id", b.id).select();
      check("read receipts are immutable", Boolean(editRead.error) || (editRead.data ?? []).length === 0);

      const delRead = await b.client.from("message_reads").delete().eq("reader_id", b.id).select();
      check("read receipts cannot be deleted from the client", Boolean(delRead.error) || (delRead.data ?? []).length === 0);
    }

    /* ================================================= inbox RPC projection */
    {
      const inbox = await a.client.rpc("my_conversations");
      check("the inbox RPC returns the member's conversations", !inbox.error && (inbox.data ?? []).length >= 1, inbox.error?.message);

      const serialised = JSON.stringify(inbox.data ?? []);
      check("the inbox payload carries no email address", !/@/.test(serialised.replace(/[^\x20-\x7e]/g, "")));
      check("the inbox payload carries no coordinates", !/latitude|longitude/i.test(serialised));
      check("the inbox payload carries no moderation state", !/moderation/i.test(serialised));
      check("the inbox payload carries no date of birth", !/date_of_birth/i.test(serialised));

      const outsiderInbox = await outsider.client.rpc("my_conversations");
      check("the inbox RPC is scoped to the caller", ((outsiderInbox.data ?? []) as unknown[]).length === 0);

      const anonInbox = await anon.rpc("my_conversations");
      check("signed-out visitors cannot call the inbox RPC", Boolean(anonInbox.error));

      const forged = createClient(url, publishableKey, {
        auth: { persistSession: false },
        global: { headers: { Authorization: "Bearer forged.jwt.value" } },
      });
      const forgedCall = await forged.rpc("my_conversations");
      check("a forged bearer token cannot call the inbox RPC", Boolean(forgedCall.error));
    }

    /* ============================================================ unmatching */
    {
      const un = await matchPair(unmatchA, unmatchB);
      const before = await send(unmatchA, un.conversationId, "Before the unmatch.");
      check("messaging works while the match is active", !before.error, before.error?.message);

      const end = await unmatchB.client.from("matches").update({ status: "unmatched" }).eq("id", un.matchId).select();
      check("a participant can end their own match", !end.error, end.error?.message);

      const after = await send(unmatchA, un.conversationId, "After the unmatch.");
      check("messaging stops immediately after an unmatch", Boolean(after.error));

      const afterOther = await send(unmatchB, un.conversationId, "Also after the unmatch.");
      check("the member who unmatched also cannot send", Boolean(afterOther.error));

      const history = await unmatchA.client.from("messages").select("*").eq("conversation_id", un.conversationId);
      check("history stays readable to both members after an unmatch", (history.data ?? []).length >= 1);

      const inbox = await unmatchA.client.rpc("my_conversations");
      const row = ((inbox.data ?? []) as Array<Record<string, unknown>>).find((r) => r["conversation_id"] === un.conversationId);
      check("the inbox marks an unmatched conversation as read-only", row?.["can_send"] === false, row?.["can_send"]);
    }

    /* =============================================================== blocking */
    {
      const bl = await matchPair(blockA, blockB);
      const ok = await send(blockA, bl.conversationId, "Before the block.");
      check("messaging works before the block", !ok.error, ok.error?.message);

      const block = await blockA.client.from("blocks").insert({ blocker_id: blockA.id, blocked_id: blockB.id });
      check("a member can block someone they are matched with", !block.error, block.error?.message);

      const blockerSend = await send(blockA, bl.conversationId, "Blocker still talking.");
      check("the blocker can no longer send in that conversation", Boolean(blockerSend.error));

      const blockedSend = await send(blockB, bl.conversationId, "Blocked member talking.");
      check("the blocked member can no longer send", Boolean(blockedSend.error));

      const blockedRead = await blockB.client.from("messages").select("*").eq("conversation_id", bl.conversationId);
      check("the blocked member can no longer read the thread", (blockedRead.data ?? []).length === 0);

      const blockerRead = await blockA.client.from("messages").select("*").eq("conversation_id", bl.conversationId);
      check("the blocker can no longer read the thread either", (blockerRead.data ?? []).length === 0);

      const blockedInbox = await blockB.client.rpc("my_conversations");
      const present = ((blockedInbox.data ?? []) as Array<Record<string, unknown>>).some((r) => r["conversation_id"] === bl.conversationId);
      check("a blocked conversation disappears from the inbox", !present);

      const blockedMark = await blockB.client.rpc("mark_conversation_read", { p_conversation: bl.conversationId });
      check("a blocked member cannot mark the conversation read", Boolean(blockedMark.error));

      const matchRow = await admin.from("matches").select("status").eq("id", bl.matchId).single();
      check("blocking ends the underlying match", matchRow.data?.["status"] === "blocked", matchRow.data?.["status"]);
    }

    /* ======================================================= message reports */
    {
      const target = await send(b, pair.conversationId, "A message worth reporting.");
      const targetId = target.data?.["id"] as string;

      const report = await a.client
        .from("message_reports")
        .insert({
          reporter_id: a.id,
          reported_id: b.id,
          message_id: targetId,
          conversation_id: pair.conversationId,
          category: "harassment",
          description: "Audit fixture report.",
        })
        .select()
        .single();
      check("a member can report a message they received", !report.error, report.error?.message);

      const selfReport = await a.client
        .from("message_reports")
        .insert({
          reporter_id: a.id,
          reported_id: a.id,
          message_id: targetId,
          conversation_id: pair.conversationId,
          category: "spam",
        })
        .select();
      check("a member cannot report themselves", Boolean(selfReport.error));

      const spoofReporter = await b.client
        .from("message_reports")
        .insert({
          reporter_id: a.id,
          reported_id: b.id,
          message_id: targetId,
          conversation_id: pair.conversationId,
          category: "spam",
        })
        .select();
      check("a member cannot file a report in someone else's name", Boolean(spoofReporter.error) || (spoofReporter.data ?? []).length === 0);

      const outsiderReport = await outsider.client
        .from("message_reports")
        .insert({
          reporter_id: outsider.id,
          reported_id: b.id,
          message_id: targetId,
          conversation_id: pair.conversationId,
          category: "spam",
        })
        .select();
      check("a non-member cannot report a message in a conversation they cannot see", Boolean(outsiderReport.error) || (outsiderReport.data ?? []).length === 0);

      const reportedView = await b.client.from("message_reports").select("*");
      check("the reported member cannot see the report", (reportedView.data ?? []).length === 0);

      const enumerate = await outsider.client.from("message_reports").select("*");
      check("ordinary members cannot enumerate message reports", (enumerate.data ?? []).length === 0);

      const anonView = await anon.from("message_reports").select("*");
      check("signed-out visitors cannot read message reports", Boolean(anonView.error) || (anonView.data ?? []).length === 0);

      const escalate = await a.client.from("message_reports").update({ status: "actioned" }).eq("id", report.data!["id"]).select();
      check("a reporter cannot change the status of their report", Boolean(escalate.error) || (escalate.data ?? []).length === 0);

      const del = await a.client.from("message_reports").delete().eq("id", report.data!["id"]).select();
      check("message reports are append-only", Boolean(del.error) || (del.data ?? []).length === 0);

      const duplicate = await a.client
        .from("message_reports")
        .insert({
          reporter_id: a.id,
          reported_id: b.id,
          message_id: targetId,
          conversation_id: pair.conversationId,
          category: "spam",
        })
        .select();
      check("the same message cannot be reported twice by the same member", Boolean(duplicate.error));

      const longDescription = await a.client
        .from("message_reports")
        .insert({
          reporter_id: a.id,
          reported_id: b.id,
          message_id: targetId,
          conversation_id: pair.conversationId,
          category: "spam",
          description: "x".repeat(1001),
        })
        .select();
      check("report descriptions are length-capped", Boolean(longDescription.error));

      const senderMismatch = await b.client
        .from("message_reports")
        .insert({
          reporter_id: b.id,
          reported_id: a.id,
          message_id: targetId,
          conversation_id: pair.conversationId,
          category: "spam",
        })
        .select();
      check("a member cannot report someone for a message they did not send", Boolean(senderMismatch.error) || (senderMismatch.data ?? []).length === 0);
    }

    /* ================================================== realtime boundaries */
    {
      const outsiderClient = outsider.client;
      const received: unknown[] = [];
      const channel = outsiderClient
        .channel(`audit-${stamp}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
          received.push(payload);
        });
      await new Promise<void>((resolve) => {
        channel.subscribe(() => resolve());
        setTimeout(resolve, 4000);
      });
      await send(a, pair.conversationId, "Realtime leak probe.");
      await new Promise((resolve) => setTimeout(resolve, 2500));
      check("realtime does not deliver messages to a non-member", received.length === 0, received.length);
      await outsiderClient.removeChannel(channel);

      const anonReceived: unknown[] = [];
      const anonChannel = anon
        .channel(`audit-anon-${stamp}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
          anonReceived.push(payload);
        });
      await new Promise<void>((resolve) => {
        anonChannel.subscribe(() => resolve());
        setTimeout(resolve, 4000);
      });
      await send(a, pair.conversationId, "Anonymous realtime probe.");
      await new Promise((resolve) => setTimeout(resolve, 2500));
      check("realtime does not deliver messages to signed-out listeners", anonReceived.length === 0, anonReceived.length);
      await anon.removeChannel(anonChannel);
    }

    /* ========================================== pagination and enumeration */
    {
      const rows = Array.from({ length: 5 }, (_, i) => ({
        conversation_id: pair.conversationId,
        sender_id: a.id,
        message_type: "text" as const,
        body: `Pagination fixture ${i}`,
      }));
      for (const row of rows) await a.client.from("messages").insert(row);

      const page = await a.client
        .from("messages")
        .select("*")
        .eq("conversation_id", pair.conversationId)
        .order("created_at", { ascending: false })
        .limit(MESSAGE_PAGE_SIZE);
      check("history pages are bounded", (page.data ?? []).length <= MESSAGE_PAGE_SIZE, (page.data ?? []).length);

      const crossPage = await outsider.client
        .from("messages")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);
      check("pagination cannot be used to enumerate other conversations", (crossPage.data ?? []).length === 0);

      const unbounded = await a.client.from("messages").select("*").limit(1000);
      const conversationIds = new Set((unbounded.data ?? []).map((r) => r["conversation_id"]));
      check("an unbounded query still only returns the caller's conversations", conversationIds.size <= 1);

      const ghost = await a.client.from("messages").select("*").eq("conversation_id", FAKE_UUID);
      check("querying an unknown conversation returns nothing rather than an error hint", (ghost.data ?? []).length === 0);
    }

    /* ================================================== projection and errors */
    {
      const raw = await a.client.from("messages").select("*").eq("conversation_id", pair.conversationId).limit(1).single();
      const projected = toChatMessage(raw.data as never);
      check(
        "the client projection exposes only allowlisted fields",
        Object.keys(projected).every((key) => MESSAGE_ALLOWLIST.has(key)),
        Object.keys(projected),
      );
      check("the client projection drops moderation state", !("moderationStatus" in projected) && !("moderation_flags" in projected));

      const withdrawn = toChatMessage({ ...(raw.data as never), deleted_at: new Date().toISOString(), body: "leftover" } as never);
      check("the projection never renders the body of a withdrawn message", withdrawn.body === null);

      const merged = mergeMessages(
        [{ ...projected }],
        [{ ...projected }, { ...projected, id: `${projected.id}-2`, createdAt: new Date(Date.now() + 1000).toISOString() }],
      );
      check("duplicate realtime deliveries are de-duplicated", merged.length === 2);

      const err = (await a.client.rpc("mark_conversation_read", { p_conversation: FAKE_UUID })).error;
      const message = `${err?.message ?? ""} ${err?.details ?? ""}`;
      check("messaging errors do not leak schema internals", !/pg_|postgres|auth\.users|service_role/i.test(message), message);
    }

    /* ============================================== moderation screener */
    {
      const scam = heuristicScreener.screen("Send me money via western union for a guaranteed profit");
      check("the screener flags financial solicitation", (scam as { flags: string[] }).flags.includes("financial_solicitation"));
      const clean = heuristicScreener.screen("Would you like to get coffee this weekend?");
      check("the screener does not flag an ordinary message", (clean as { flagged: boolean }).flagged === false);
      const threat = heuristicScreener.screen("i know where you live");
      check("the screener flags threats", (threat as { flags: string[] }).flags.includes("threat"));

      const stored = await admin.from("messages").select("moderation_status").eq("conversation_id", pair.conversationId).limit(1).single();
      check("moderation never blocks delivery — messages stay unreviewed, not removed", stored.data?.["moderation_status"] === "unreviewed");
    }

    /* ================================================= privilege hygiene */
    {
      const forgedSend = createClient(url, publishableKey, {
        auth: { persistSession: false },
        global: { headers: { Authorization: "Bearer forged.jwt.value" } },
      });
      const forged = await forgedSend.from("messages").insert({
        conversation_id: pair.conversationId,
        sender_id: a.id,
        message_type: "text",
        body: "Forged token message.",
      }).select();
      check("a forged bearer token cannot send a message", Boolean(forged.error) || (forged.data ?? []).length === 0);

      const truncate = await a.client.rpc("mark_conversation_read", { p_conversation: "not-a-uuid" } as never);
      check("malformed RPC input is rejected cleanly", Boolean(truncate.error));

      const deletedProfile = await a.client.from("profiles").update({ deleted_at: new Date().toISOString() }).eq("id", b.id).select();
      check("a member cannot mark someone else's profile deleted to silence them", (deletedProfile.data ?? []).length === 0);
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
