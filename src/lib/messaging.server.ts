/**
 * Server-only messaging helpers. Never imported by browser code.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { screenMessage } from "@/lib/moderation";
import { assessContent } from "@/lib/safety-engine";

type Client = SupabaseClient<Database>;

/**
 * Runs the local Safety Engine and records advisory results for moderation:
 * flags on the message, plus a staff-only safety signal when the assessment
 * reaches medium or high risk (which raises the priority of a moderation case
 * for human review). Screening never blocks or alters delivery, never notifies
 * anyone, and never takes an enforcement action on its own.
 */
export async function recordModerationHints(
  messageId: string,
  body: string,
  senderId: string,
): Promise<void> {
  const [verdict, assessment] = await Promise.all([screenMessage(body), assessContent(body)]);
  if (!verdict.flagged) return;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("messages")
    .update({ moderation_status: "flagged", moderation_flags: verdict.flags })
    .eq("id", messageId);

  if (assessment.riskLevel === "medium" || assessment.riskLevel === "high") {
    await supabaseAdmin.from("safety_signals").insert({
      subject_id: senderId,
      message_id: messageId,
      risk_level: assessment.riskLevel,
      categories: assessment.categories,
      screener: assessment.screener,
    });
  }
}


/**
 * Resolves the header for a conversation the database has already confirmed
 * the viewer belongs to. Returns only card-safe fields.
 */
export async function loadConversationHeader(
  supabase: Client,
  conversationId: string,
  viewerId: string,
): Promise<{
  otherProfileId: string;
  matchId: string;
  firstName: string | null;
  age: number | null;
  city: string | null;
  country: string | null;
  photoPath: string | null;
  canSend: boolean;
  showOnlineStatus: boolean;
} | null> {
  // RLS: only a member of this conversation can read the row at all.
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, match_id, profile_a, profile_b")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conversation) return null;

  const otherProfileId =
    conversation.profile_a === viewerId ? conversation.profile_b : conversation.profile_a;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: profile }, { data: match }, { data: privacy }, { data: photo }] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("first_name, date_of_birth, city, country, deleted_at")
      .eq("id", otherProfileId)
      .maybeSingle(),
    supabaseAdmin.from("matches").select("status").eq("id", conversation.match_id).maybeSingle(),
    supabaseAdmin
      .from("privacy_settings")
      .select("show_online_status")
      .eq("profile_id", otherProfileId)
      .maybeSingle(),
    supabaseAdmin
      .from("profile_photos")
      .select("storage_path")
      .eq("profile_id", otherProfileId)
      .order("is_primary", { ascending: false })
      .order("display_order", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const age = profile?.date_of_birth
    ? Math.floor((Date.now() - new Date(profile.date_of_birth).getTime()) / 31_557_600_000)
    : null;

  return {
    otherProfileId,
    matchId: conversation.match_id,
    firstName: profile?.first_name ?? null,
    age,
    city: profile?.city ?? null,
    country: profile?.country ?? null,
    photoPath: photo?.storage_path ?? null,
    canSend: match?.status === "active" && !profile?.deleted_at,
    showOnlineStatus: privacy?.show_online_status ?? false,
  };
}
