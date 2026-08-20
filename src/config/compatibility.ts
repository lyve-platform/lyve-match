/**
 * LYVE Compatibility Engine — configuration.
 *
 * Every weight, threshold and ranking factor lives here. Nothing in the
 * application may hard-code a weight: import from this module instead so the
 * model can be tuned (or A/B tested later) in one place.
 *
 * Fairness rules baked into this configuration:
 *  - No protected characteristic (gender, ethnicity, religion, nationality,
 *    disability) is ever a scoring variable. Gender is used only as a hard
 *    eligibility filter expressing what each member asked for, never as a
 *    quality signal.
 *  - Popularity (likes received, match count) is deliberately absent from both
 *    the score and the ranking factors.
 *  - Dimensions with no data are dropped and their weight is redistributed, so
 *    an incomplete profile is never scored as "incompatible".
 */

export const COMPATIBILITY_DIMENSIONS = [
  "intent",
  "interests",
  "lifestyle",
  "personality",
  "agePreference",
  "location",
  "relationshipPreferences",
] as const;

export type CompatibilityDimension = (typeof COMPATIBILITY_DIMENSIONS)[number];

/** Weights must sum to 1. */
export const COMPATIBILITY_WEIGHTS: Record<CompatibilityDimension, number> = {
  intent: 0.25,
  interests: 0.15,
  lifestyle: 0.15,
  personality: 0.15,
  agePreference: 0.1,
  location: 0.1,
  relationshipPreferences: 0.1,
};

/** How closely related two different intents are (0 = unrelated, 1 = identical). */
export const INTENT_AFFINITY: Record<string, Record<string, number>> = {
  marriage: {
    marriage: 1,
    serious_relationship: 0.7,
    dating: 0.3,
    open_to_possibilities: 0.3,
    new_connections: 0.1,
  },
  serious_relationship: {
    marriage: 0.7,
    serious_relationship: 1,
    dating: 0.5,
    open_to_possibilities: 0.5,
    new_connections: 0.2,
  },
  dating: {
    marriage: 0.3,
    serious_relationship: 0.5,
    dating: 1,
    open_to_possibilities: 0.7,
    new_connections: 0.5,
  },
  open_to_possibilities: {
    marriage: 0.3,
    serious_relationship: 0.5,
    dating: 0.7,
    open_to_possibilities: 1,
    new_connections: 0.7,
  },
  new_connections: {
    marriage: 0.1,
    serious_relationship: 0.2,
    dating: 0.5,
    open_to_possibilities: 0.7,
    new_connections: 1,
  },
};

/** Distance (km) at which the location dimension reaches its lowest score. */
export const LOCATION_FALLOFF_KM = 300;

/** Shared-interest count that already counts as a perfect interests score. */
export const INTERESTS_SATURATION = 5;

/** Only reasons at or above this subscore are shown to the member. */
export const REASON_MIN_SUBSCORE = 0.6;

/** Maximum number of "why you match" reasons rendered on a card. */
export const MAX_REASONS = 4;

/**
 * Deterministic discovery ranking. Higher weight = stronger influence.
 * Popularity is intentionally not a factor.
 */
export const RANKING_WEIGHTS = {
  compatibility: 0.6,
  profileCompleteness: 0.25,
  recentActivity: 0.15,
} as const;

/** Activity older than this contributes nothing to the recency factor. */
export const ACTIVITY_HORIZON_DAYS = 30;

/** Discovery paging. The client never receives more than one page. */
export const DISCOVERY_PAGE_SIZE = 10;
/** Candidate pool fetched per page before scoring and ranking (server-side only). */
export const DISCOVERY_POOL_SIZE = 40;
