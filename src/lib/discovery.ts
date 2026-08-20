/**
 * Discovery interactions performed by the signed-in member from the browser.
 *
 * Writes go straight to RLS-protected tables: a member may only insert rows
 * where they are the actor (`liker_id`, `passer_id`, `blocker_id`,
 * `reporter_id` = auth.uid()), and database triggers own everything that must
 * not be client-controlled — mutual likes create the match, blocks tear down
 * likes and matches, and unmatch is the only status change an owner may make.
 */
import { supabase } from "@/integrations/supabase/client";
import type { ReportCategory } from "@/config/lyve";

export type LikeOutcome = { matched: boolean };

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("NOT_AUTHENTICATED");
  return data.user.id;
}

/** Likes a member. A mutual like becomes a match through a database trigger. */
export async function likeProfile(profileId: string): Promise<LikeOutcome> {
  const likerId = await currentUserId();
  const { error } = await supabase
    .from("likes")
    .upsert({ liker_id: likerId, likee_id: profileId }, { onConflict: "liker_id,likee_id" });
  if (error) throw error;

  const { data, error: matchError } = await supabase
    .from("matches")
    .select("id")
    .eq("status", "active")
    .or(
      `and(profile_a.eq.${likerId},profile_b.eq.${profileId}),and(profile_a.eq.${profileId},profile_b.eq.${likerId})`,
    )
    .maybeSingle();
  if (matchError) throw matchError;

  return { matched: Boolean(data) };
}

/** Passes on a member: they will not be shown again. */
export async function passProfile(profileId: string): Promise<void> {
  const passerId = await currentUserId();
  const { error } = await supabase
    .from("passes")
    .upsert({ passer_id: passerId, passed_id: profileId }, { onConflict: "passer_id,passed_id" });
  if (error) throw error;
}

/** Ends a match. Both sides lose the connection immediately. */
export async function unmatch(matchId: string): Promise<void> {
  const userId = await currentUserId();
  const { error } = await supabase
    .from("matches")
    .update({ status: "unmatched", ended_by: userId, ended_at: new Date().toISOString() })
    .eq("id", matchId);
  if (error) throw error;
}

/**
 * Blocks a member. The block is mutual and permanent until removed: existing
 * likes are deleted and any match is ended by the database trigger.
 */
export async function blockProfile(profileId: string): Promise<void> {
  const blockerId = await currentUserId();
  const { error } = await supabase
    .from("blocks")
    .upsert(
      { blocker_id: blockerId, blocked_id: profileId },
      { onConflict: "blocker_id,blocked_id" },
    );
  if (error) throw error;
}

export async function unblockProfile(profileId: string): Promise<void> {
  const blockerId = await currentUserId();
  const { error } = await supabase
    .from("blocks")
    .delete()
    .eq("blocker_id", blockerId)
    .eq("blocked_id", profileId);
  if (error) throw error;
}

export type BlockedMember = { profileId: string; firstName: string | null; blockedAt: string };

/** The member's own block list (ids and first names only). */
export async function fetchBlockedMembers(): Promise<BlockedMember[]> {
  const { data, error } = await supabase
    .from("blocks")
    .select("blocked_id, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    profileId: row.blocked_id,
    firstName: null,
    blockedAt: row.created_at,
  }));
}

/** Files a safety report. Reporting never reveals anything to the reported member. */
export async function reportProfile(input: {
  profileId: string;
  category: ReportCategory;
  description?: string;
  alsoBlock?: boolean;
}): Promise<void> {
  const reporterId = await currentUserId();
  const { error } = await supabase.from("reports").insert({
    reporter_id: reporterId,
    reported_id: input.profileId,
    category: input.category,
    description: input.description?.trim() ? input.description.trim().slice(0, 1000) : null,
  });
  if (error) throw error;
  if (input.alsoBlock) await blockProfile(input.profileId);
}
