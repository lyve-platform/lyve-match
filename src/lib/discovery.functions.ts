/**
 * Discovery server functions.
 *
 * Every candidate list is produced by a SECURITY DEFINER database function that
 * derives the viewer from the authenticated session — the client cannot pass a
 * viewer id, a filter, or any predicate that widens eligibility. The only
 * client input is a page number, which is clamped server-side.
 *
 * Photos live in a private bucket, so signed URLs are minted here (server-only,
 * short-lived) after the database has confirmed the viewer may see that member.
 * Storage paths never reach the browser.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DISCOVERY_PAGE_SIZE, DISCOVERY_POOL_SIZE } from "@/config/compatibility";
import {
  rankCandidates,
  toDiscoveryCard,
  type CandidateRow,
  type DiscoveryCard,
  type LikeCard,
  type MatchCard,
  type ViewerFacts,
} from "@/lib/discovery-core";
import {
  listBlockedNames,
  loadViewerFacts,
  signPhotoUrls,
  touchLastActive,
} from "@/lib/discovery.server";
import { hasEntitlement, requireEntitlement } from "@/lib/entitlements.server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


export const getDiscoveryFeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { page?: number } | undefined) => ({
    page: Math.min(Math.max(Math.trunc(Number(input?.page ?? 0)) || 0, 0), 50),
  }))
  .handler(async ({ data, context }): Promise<{ cards: DiscoveryCard[]; nextPage: number | null }> => {
    const { supabase, userId } = context;

    const { data: rows, error } = await supabase.rpc("discover_candidates", {
      p_limit: DISCOVERY_POOL_SIZE,
      p_offset: data.page * DISCOVERY_POOL_SIZE,
    });
    if (error) throw error;

    const pool = (rows ?? []) as unknown as CandidateRow[];
    const viewer: ViewerFacts = await loadViewerFacts(supabase, userId);
    const ranked = rankCandidates(viewer, pool, DISCOVERY_PAGE_SIZE);

    const urls = await signPhotoUrls(ranked.flatMap(({ row }) => (row.photo_paths ?? []).slice(0, 3)));
    await touchLastActive(supabase, userId);

    return {
      cards: ranked.map(({ row, compatibility }) =>
        toDiscoveryCard(
          row,
          compatibility,
          (row.photo_paths ?? []).slice(0, 3).flatMap((path) => (urls[path] ? [urls[path]] : [])),
        ),
      ),
      nextPage: pool.length === DISCOVERY_POOL_SIZE ? data.page + 1 : null,
    };
  });

/**
 * Who Liked Me — Premium gate enforced HERE, not in the UI.
 *
 * A Free caller always receives the same shape with `locked: true` and an
 * empty list: only the count survives, so the identities cannot be recovered
 * by replaying the request, editing state, or calling the RPC path directly.
 */
export const getLikesReceived = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ locked: boolean; count: number; cards: LikeCard[] }> => {
    const { data: rows, error } = await context.supabase.rpc("likes_received");
    if (error) throw error;

    const list = (rows ?? []) as unknown as Array<CandidateRow & { liked_at: string }>;

    const unlocked = await hasEntitlement(context.supabase, context.userId, "who_liked_me");
    if (!unlocked) return { locked: true, count: list.length, cards: [] };

    const urls = await signPhotoUrls(list.flatMap((row) => (row.photo_paths ?? []).slice(0, 3)));

    return {
      locked: false,
      count: list.length,
      cards: list.map((row) => {
        const card = toDiscoveryCard(
          row,
          null,
          (row.photo_paths ?? []).slice(0, 3).flatMap((path) => (urls[path] ? [urls[path]] : [])),
        );
        const { distanceBucketKm: _d, compatibility: _c, ...rest } = card;
        return { ...rest, likedAt: row.liked_at };
      }),
    };
  });

/**
 * Premium compatibility insight for one candidate.
 *
 * Basic compatibility (the score already on the discovery card) stays free.
 * The detailed breakdown is entitlement-checked server-side and recomputed
 * from the database row — a client-supplied score or URL parameter changes
 * nothing.
 */
export const getCompatibilityInsight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { profileId: string }) => {
    const profileId = String(input?.profileId ?? "");
    if (!UUID.test(profileId)) throw new Error("INVALID_PROFILE");
    return { profileId };
  })
  .handler(async ({ data, context }) => {
    await requireEntitlement(context.supabase, context.userId, "compatibility_insights");

    // Re-derive from the viewer-scoped candidate pool: a member the viewer may
    // not see cannot be inspected through this endpoint either.
    const { data: rows, error } = await context.supabase.rpc("discover_candidates", {
      p_limit: DISCOVERY_POOL_SIZE,
      p_offset: 0,
    });
    if (error) throw error;

    const row = ((rows ?? []) as unknown as CandidateRow[]).find(
      (candidate) => candidate.profile_id === data.profileId,
    );
    if (!row) return { available: false as const };

    const viewer: ViewerFacts = await loadViewerFacts(context.supabase, context.userId);
    const ranked = rankCandidates(viewer, [row], 1)[0];
    return { available: true as const, compatibility: ranked?.compatibility ?? null };
  });


export const getMatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MatchCard[]> => {
    const { data: rows, error } = await context.supabase.rpc("my_matches");
    if (error) throw error;

    const list = (rows ?? []) as unknown as Array<
      CandidateRow & { match_id: string; matched_at: string }
    >;
    const urls = await signPhotoUrls(list.flatMap((row) => (row.photo_paths ?? []).slice(0, 3)));

    return list.map((row) => {
      const card = toDiscoveryCard(
        row,
        null,
        (row.photo_paths ?? []).slice(0, 3).flatMap((path) => (urls[path] ? [urls[path]] : [])),
      );
      const { distanceBucketKm: _d, compatibility: _c, ...rest } = card;
      return { ...rest, matchId: row.match_id, matchedAt: row.matched_at };
    });
  });

export const getBlockedMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Array<{ profileId: string; firstName: string | null; blockedAt: string }>> => {
    const { data, error } = await context.supabase
      .from("blocks")
      .select("blocked_id, created_at")
      .eq("blocker_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    return listBlockedNames(
      (data ?? []).map((row) => ({ profileId: row.blocked_id, blockedAt: row.created_at })),
    );
  });
