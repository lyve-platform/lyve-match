/**
 * Discovery core — shared types, ranking and safe-projection helpers.
 *
 * This module holds every piece of discovery logic that is NOT a server
 * function declaration, so `discovery.functions.ts` can stay a thin wrapper.
 *
 * The safe projection is the single place where a candidate row is turned into
 * something a member is allowed to see. Anything not listed in `DiscoveryCard`
 * never leaves the server: no email, no account identifiers beyond the opaque
 * profile id needed to like/pass, no storage paths, no coordinates, no
 * preferences and no privacy settings.
 */
import { ACTIVITY_HORIZON_DAYS, RANKING_WEIGHTS } from "@/config/compatibility";
import {
  computeCompatibility,
  hasEstimate,
  type CompatibilityInput,
  type CompatibilityResult,
} from "@/lib/compatibility";

export type ViewerFacts = CompatibilityInput["viewer"];

/** Raw row shape returned by the `discover_candidates` database function. */
export type CandidateRow = {
  profile_id: string;
  first_name: string | null;
  age: number | null;
  city: string | null;
  country: string | null;
  distance_km: number | null;
  relationship_intent: string | null;
  bio: string | null;
  interest_slugs: string[] | null;
  photo_paths: string[] | null;
  smoking: string | null;
  drinking: string | null;
  exercise: string | null;
  children: string | null;
  social_energy: string | null;
  communication_style: string | null;
  they_want_my_age: boolean | null;
  they_want_my_gender: boolean | null;
  they_want_my_intent: boolean | null;
  completeness: number | null;
  last_active_at: string | null;
  is_verified?: boolean | null;
};

/** Everything — and only what — the browser receives about another member. */
export type DiscoveryCard = {
  profileId: string;
  firstName: string;
  age: number | null;
  /** Approximate location only: city and country, never coordinates. */
  city: string | null;
  country: string | null;
  /** Rounded to a coarse bucket so an exact position can never be inferred. */
  distanceBucketKm: number | null;
  intent: string | null;
  interestSlugs: string[];
  bio: string | null;
  photoUrls: string[];
  /** True only when a reviewer approved this member's verification selfie. */
  verified: boolean;
  compatibility: CompatibilityResult | null;
};

export type LikeCard = Omit<DiscoveryCard, "distanceBucketKm" | "compatibility"> & {
  likedAt: string;
};

export type MatchCard = Omit<DiscoveryCard, "distanceBucketKm" | "compatibility"> & {
  matchId: string;
  matchedAt: string;
};

/** Coarse distance buckets: <5, then rounded to the nearest 10 km, capped. */
export function bucketDistance(distanceKm: number | null): number | null {
  if (distanceKm === null || Number.isNaN(distanceKm)) return null;
  if (distanceKm < 5) return 5;
  if (distanceKm > 500) return 500;
  return Math.round(distanceKm / 10) * 10;
}

/** Defence in depth: a stored value outside 0-1 can never inflate a rank. */
function clampUnit(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

function recencyFactor(lastActiveAt: string | null): number {
  if (!lastActiveAt) return 0;
  const days = (Date.now() - new Date(lastActiveAt).getTime()) / 86_400_000;
  if (!Number.isFinite(days) || days < 0) return 1;
  return Math.max(0, 1 - days / ACTIVITY_HORIZON_DAYS);
}

/**
 * Deterministic ranking score. Popularity is deliberately not a factor, and no
 * protected characteristic takes part.
 */
export function rankingScore(row: CandidateRow, compatibility: number): number {
  return (
    RANKING_WEIGHTS.compatibility * (compatibility / 100) +
    RANKING_WEIGHTS.profileCompleteness * clampUnit(Number(row.completeness ?? 0)) +
    RANKING_WEIGHTS.recentActivity * recencyFactor(row.last_active_at)
  );
}

export function scoreCandidate(viewer: ViewerFacts, row: CandidateRow): CompatibilityResult {
  return computeCompatibility({
    viewer,
    candidate: {
      age: row.age,
      intent: row.relationship_intent,
      interestSlugs: row.interest_slugs ?? [],
      city: row.city,
      country: row.country,
      distanceKm: row.distance_km,
      theyWantMyAge: row.they_want_my_age,
      theyWantMyIntent: row.they_want_my_intent,
      smoking: row.smoking,
      drinking: row.drinking,
      exercise: row.exercise,
      children: row.children,
      social_energy: row.social_energy,
      communication_style: row.communication_style,
    },
  });
}

/** Score, rank and cut the candidate pool down to one page. */
export function rankCandidates(
  viewer: ViewerFacts,
  rows: CandidateRow[],
  pageSize: number,
): Array<{ row: CandidateRow; compatibility: CompatibilityResult | null }> {
  return rows
    .map((row) => {
      const result = scoreCandidate(viewer, row);
      const compatibility = hasEstimate(result) ? result : null;
      return { row, compatibility, rank: rankingScore(row, compatibility?.score ?? 0) };
    })
    .sort((a, b) => b.rank - a.rank || a.row.profile_id.localeCompare(b.row.profile_id))
    .slice(0, pageSize)
    .map(({ row, compatibility }) => ({ row, compatibility }));
}

export function toDiscoveryCard(
  row: CandidateRow,
  compatibility: CompatibilityResult | null,
  photoUrls: string[],
): DiscoveryCard {
  return {
    profileId: row.profile_id,
    firstName: row.first_name ?? "",
    age: row.age,
    city: row.city,
    country: row.country,
    distanceBucketKm: bucketDistance(row.distance_km),
    intent: row.relationship_intent,
    interestSlugs: (row.interest_slugs ?? []).slice(0, 6),
    bio: row.bio,
    photoUrls,
    verified: row.is_verified === true,
    compatibility,
  };
}
