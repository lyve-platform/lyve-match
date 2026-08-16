/**
 * LYVE — temporary end-to-end chat trial between two throwaway members.
 *
 * Creates two `@lyve.test` fixture accounts, matches them, exchanges messages,
 * checks realtime delivery, read receipts and the conversation list RPC, then
 * deletes both accounts. Nothing is left behind.
 *
 * Run:  bun run tests/functional/chat-trial.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { sweepTestAccounts } from "../security/sweep-test-accounts";
import { screenMessage } from "../../src/lib/moderation";

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

const stamp = Date.now();
const password = `Chat-trial-${stamp}`;

type Member = { id: string; email: string; name: string; client: SupabaseClient };

async function createMember(tag: string, name: string): Promise<Member> {
  const email = `chat-${tag}-${stamp}@lyve.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const client = createClient(url, publishableKey, { auth: { persistSession: false } });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { id: data.user!.id, email, name, client };
}

function dobYearsAgo(years: number) {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  return date.toISOString().slice(0, 10);
}

async function seedMember(member: Member, gender: "woman" | "man") {
  let res = await member.client.from("profiles").insert({
    id: member.id,
    first_name: member.name,
    date_of_birth: dobYearsAgo(28),
    gender,
    relationship_intent: "serious_relationship",
    city: "Dubai",
    country: "AE",
    bio: "Temporary chat trial fixture.",
  });
  if (res.error) throw res.error;
  res = await member.client.from("preferences").insert({
    profile_id: member.id,
    min_age: 18,
    max_age: 99,
    preferred_genders: [],
    intents: [],
    max_distance_km: 500,
  });
  if (res.error) throw res.error;
  res = await member.client.from("privacy_settings").insert({
    profile_id: member.id,
    discoverable: true,
    profile_visibility: "everyone",
  });
  if (res.error) throw res.error;
}

async function send(member: Member, conversationId: string, body: string) {
  return member.client
    .from("messages")
    .insert({ conversation_id: conversationId, sender_id: member.id, message_type: "text", body })
    .select()
    .single();
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await sweepTestAccounts();

  const amina = await createMember("amina", "Amina");
  const daniel = await createMember("daniel", "Daniel");

  try {
    await seedMember(amina, "woman");
    await seedMember(daniel, "man");

    /* -------------------------------------------------- discovery + match */
    const discover = await amina.client.rpc("discover_candidates", { p_limit: 20, p_offset: 0 });
    check(
      "Amina can see Daniel in discovery",
      (discover.data ?? []).some((row: Record<string, unknown>) => row["profile_id"] === daniel.id),
      discover.error?.message,
    );

    const like1 = await amina.client.from("likes").insert({ liker_id: amina.id, likee_id: daniel.id });
    check("Amina likes Daniel", !like1.error, like1.error?.message);
    const like2 = await daniel.client.from("likes").insert({ liker_id: daniel.id, likee_id: amina.id });
    check("Daniel likes back", !like2.error, like2.error?.message);

    const lo = amina.id < daniel.id ? amina.id : daniel.id;
    const hi = amina.id < daniel.id ? daniel.id : amina.id;
    const conv = await admin
      .from("conversations")
      .select("id, match_id")
      .eq("profile_a", lo)
      .eq("profile_b", hi)
      .single();
    check("mutual like creates a match and a conversation", !conv.error && Boolean(conv.data?.["id"]), conv.error?.message);
    const conversationId = conv.data!["id"] as string;

    /* ---------------------------------------------------------- realtime */
    const received: string[] = [];
    const channel = daniel.client
      .channel(`trial:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const body = (payload.new as Record<string, unknown>)["body"];
          if (typeof body === "string") received.push(body);
        },
      );
    await new Promise<void>((resolve) => {
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") resolve();
      });
      setTimeout(resolve, 5000);
    });

    /* ------------------------------------------------------- conversation */
    const m1 = await send(amina, conversationId, "Hi Daniel! Nice to match with you 👋");
    check("Amina sends the first message", !m1.error, m1.error?.message);

    const m2 = await send(daniel, conversationId, "Hey Amina, likewise! How is your week going?");
    check("Daniel replies", !m2.error, m2.error?.message);

    const m3 = await send(amina, conversationId, "Busy but good — any plans this weekend?");
    check("Amina follows up", !m3.error, m3.error?.message);

    await wait(2500);
    check(
      "Daniel receives Amina's messages over realtime",
      received.length >= 1,
      { received: received.length },
    );
    await daniel.client.removeChannel(channel);

    /* ------------------------------------------------------------- reads */
    const thread = await daniel.client
      .from("messages")
      .select("id, sender_id, body, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    check("Daniel sees the full thread in order", (thread.data ?? []).length === 3, thread.error?.message ?? thread.data?.length);
    console.log(
      "\n--- thread ---\n" +
        (thread.data ?? [])
          .map((r) => `${r["sender_id"] === amina.id ? "Amina " : "Daniel"}: ${r["body"]}`)
          .join("\n") +
        "\n",
    );

    const markRead = await daniel.client.rpc("mark_conversation_read", { p_conversation: conversationId });
    check("Daniel can mark the conversation as read", !markRead.error, markRead.error?.message);

    const list = await amina.client.rpc("my_conversations");
    const row = (list.data ?? []).find((r: Record<string, unknown>) => r["conversation_id"] === conversationId);
    check("the conversation appears in Amina's inbox", Boolean(row), list.error?.message);
    check(
      "the inbox row carries the last message preview",
      Boolean(row && String(row["last_message_preview"] ?? "").length > 0),
      row,
    );

    /* --------------------------------------------------------- moderation */
    const verdict = await screenMessage("Send me your WhatsApp +971500000000 and your bank IBAN now");
    check("the safety screener flags a risky message", verdict.flagged, verdict);

    /* -------------------------------------------------------------- block */
    const block = await amina.client.from("blocks").insert({ blocker_id: amina.id, blocked_id: daniel.id });
    check("Amina can block Daniel", !block.error, block.error?.message);
    await wait(500);
    const blockedSend = await send(daniel, conversationId, "Hello?");
    check("Daniel can no longer message after being blocked", Boolean(blockedSend.error), blockedSend.error?.message);
    const blockedRead = await daniel.client.from("messages").select("id").eq("conversation_id", conversationId);
    check("the conversation disappears for the blocked member", (blockedRead.data ?? []).length === 0);
  } finally {
    const removed = await sweepTestAccounts();
    console.log(`\ncleanup: removed ${removed} fixture account(s)`);
  }

  console.log(`\n${passed}/${passed + failed} checks passed`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
