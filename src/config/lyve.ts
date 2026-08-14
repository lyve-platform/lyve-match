/**
 * Centralised LYVE domain configuration.
 *
 * Every enum-like value used by the product is declared here once and mapped to
 * a localisation key. Never hard-code these strings in components — extend this
 * file (and the matching database enum) instead.
 */
import type { Database } from "@/integrations/supabase/types";

export type Gender = Database["public"]["Enums"]["gender_type"];
export type RelationshipIntent = Database["public"]["Enums"]["relationship_intent"];
export type ProfileVisibility = Database["public"]["Enums"]["profile_visibility"];
export type MessageAudience = Database["public"]["Enums"]["message_audience"];

export const GENDERS: readonly Gender[] = [
  "woman",
  "man",
  "non_binary",
  "other",
  "prefer_not_to_say",
];

export const RELATIONSHIP_INTENTS: readonly RelationshipIntent[] = [
  "dating",
  "serious_relationship",
  "marriage",
  "new_connections",
  "open_to_possibilities",
];

export const PROFILE_VISIBILITIES: readonly ProfileVisibility[] = [
  "everyone",
  "matches_only",
  "hidden",
];

export const MESSAGE_AUDIENCES: readonly MessageAudience[] = [
  "everyone",
  "matches_only",
  "no_one",
];

export const MIN_AGE = 18;
export const MAX_AGE = 120;
export const MAX_PHOTOS = 6;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const DELETION_GRACE_DAYS = 30;

export const ONBOARDING_STEPS = [
  { key: "date_of_birth", required: true },
  { key: "name", required: true },
  { key: "gender", required: true },
  { key: "interested_in", required: false },
  { key: "intent", required: true },
  { key: "location", required: false },
  { key: "interests", required: false },
  { key: "lifestyle", required: false },
  { key: "photos", required: false },
  { key: "bio", required: false },
  { key: "preferences", required: false },
  { key: "privacy", required: false },
  { key: "completion", required: false },
] as const;

export type OnboardingStepKey = (typeof ONBOARDING_STEPS)[number]["key"];

export const FIRST_ONBOARDING_STEP: OnboardingStepKey = ONBOARDING_STEPS[0].key;
