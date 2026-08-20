/**
 * LYVE Compatibility Engine v1 — deterministic, explainable, configurable.
 *
 * The engine is a pure function: the same two profiles always produce the same
 * score. It never calls an external service and never uses a protected
 * characteristic as a scoring variable.
 *
 * A compatibility score is an ESTIMATE of shared ground. It does not predict
 * relationship success and must always be labelled as an estimate in the UI.
 */
import {
  COMPATIBILITY_WEIGHTS,
  COMPATIBILITY_DIMENSIONS,
  INTENT_AFFINITY,
  INTERESTS_SATURATION,
  LOCATION_FALLOFF_KM,
  MAX_REASONS,
  REASON_MIN_SUBSCORE,
  type CompatibilityDimension,
} from "@/config/compatibility";

export type LifestyleFacts = {
  smoking: string | null;
  drinking: string | null;
  exercise: string | null;
  children: string | null;
};

export type PersonalityFacts = {
  social_energy: string | null;
  communication_style: string | null;
};

export type CompatibilityInput = {
  viewer: {
    age: number | null;
    intent: string | null;
    interestSlugs: string[];
    city: string | null;
    country: string | null;
    minAge: number;
    maxAge: number;
  } & LifestyleFacts &
    PersonalityFacts;
  candidate: {
    age: number | null;
    intent: string | null;
    interestSlugs: string[];
    city: string | null;
    country: string | null;
    distanceKm: number | null;
    theyWantMyAge: boolean | null;
    theyWantMyIntent: boolean | null;
  } & LifestyleFacts &
    PersonalityFacts;
};

export type CompatibilityReason = {
  /** i18n key under `discover.reasons`. */
  key: CompatibilityDimension;
  /** Optional interpolation values (e.g. shared interest slugs). */
  values?: string[];
};

export type CompatibilityResult = {
  /** 0-100, rounded. */
  score: number;
  /** Per-dimension subscore in 0-100, or null when there was no data. */
  subscores: Record<CompatibilityDimension, number | null>;
  reasons: CompatibilityReason[];
};

type Dim = { score: number | null; reason?: CompatibilityReason };

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

function scoreIntent(input: CompatibilityInput): Dim {
  const a = input.viewer.intent;
  const b = input.candidate.intent;
  if (!a || !b) return { score: null };
  const score = INTENT_AFFINITY[a]?.[b] ?? 0;
  return { score, reason: { key: "intent", values: [b] } };
}

function scoreInterests(input: CompatibilityInput): Dim {
  const mine = new Set(input.viewer.interestSlugs);
  const theirs = input.candidate.interestSlugs;
  if (mine.size === 0 || theirs.length === 0) return { score: null };
  const shared = theirs.filter((slug) => mine.has(slug));
  const score = clamp01(shared.length / INTERESTS_SATURATION);
  return { score, reason: { key: "interests", values: shared.slice(0, 3) } };
}

function pairScore(a: string | null, b: string | null): number | null {
  if (!a || !b || a === "prefer_not_to_say" || b === "prefer_not_to_say") return null;
  return a === b ? 1 : 0;
}

function averageDefined(values: Array<number | null>): number | null {
  const defined = values.filter((value): value is number => value !== null);
  if (defined.length === 0) return null;
  return defined.reduce((sum, value) => sum + value, 0) / defined.length;
}

function scoreLifestyle(input: CompatibilityInput): Dim {
  const score = averageDefined([
    pairScore(input.viewer.smoking, input.candidate.smoking),
    pairScore(input.viewer.drinking, input.candidate.drinking),
    pairScore(input.viewer.exercise, input.candidate.exercise),
    pairScore(input.viewer.children, input.candidate.children),
  ]);
  if (score === null) return { score: null };
  return { score, reason: { key: "lifestyle" } };
}

function scorePersonality(input: CompatibilityInput): Dim {
  // Complementary energies score well too: introvert + ambivert is a good mix.
  const energy = (() => {
    const a = input.viewer.social_energy;
    const b = input.candidate.social_energy;
    if (!a || !b || a === "prefer_not_to_say" || b === "prefer_not_to_say") return null;
    if (a === b) return 1;
    if (a === "ambivert" || b === "ambivert") return 0.75;
    return 0.35;
  })();
  const style = pairScore(input.viewer.communication_style, input.candidate.communication_style);
  const score = averageDefined([energy, style === null ? null : style === 1 ? 1 : 0.5]);
  if (score === null) return { score: null };
  return { score, reason: { key: "personality" } };
}

function scoreAgePreference(input: CompatibilityInput): Dim {
  const age = input.candidate.age;
  if (age === null) return { score: null };
  const { minAge, maxAge } = input.viewer;
  const inMyRange = age >= minAge && age <= maxAge;
  const inTheirRange = input.candidate.theyWantMyAge;
  const parts = [inMyRange ? 1 : 0, inTheirRange === null ? null : inTheirRange ? 1 : 0];
  const score = averageDefined(parts);
  if (score === null) return { score: null };
  return { score, reason: { key: "agePreference" } };
}

function scoreLocation(input: CompatibilityInput): Dim {
  const { distanceKm, city, country } = input.candidate;
  if (distanceKm !== null) {
    const score = clamp01(1 - distanceKm / LOCATION_FALLOFF_KM);
    return { score, reason: { key: "location", values: city ? [city] : [] } };
  }
  if (city && input.viewer.city && city.toLowerCase() === input.viewer.city.toLowerCase()) {
    return { score: 1, reason: { key: "location", values: [city] } };
  }
  if (
    country &&
    input.viewer.country &&
    country.toLowerCase() === input.viewer.country.toLowerCase()
  ) {
    return { score: 0.6, reason: { key: "location", values: country ? [country] : [] } };
  }
  if (!city && !country) return { score: null };
  return { score: 0.2 };
}

function scoreRelationshipPreferences(input: CompatibilityInput): Dim {
  // Mutual-fit signal built only from age and stated intent — never from a
  // protected characteristic.
  const score = averageDefined([
    input.candidate.theyWantMyAge === null ? null : input.candidate.theyWantMyAge ? 1 : 0,
    input.candidate.theyWantMyIntent === null ? null : input.candidate.theyWantMyIntent ? 1 : 0,
  ]);
  if (score === null) return { score: null };
  return { score, reason: { key: "relationshipPreferences" } };
}

const SCORERS: Record<CompatibilityDimension, (input: CompatibilityInput) => Dim> = {
  intent: scoreIntent,
  interests: scoreInterests,
  lifestyle: scoreLifestyle,
  personality: scorePersonality,
  agePreference: scoreAgePreference,
  location: scoreLocation,
  relationshipPreferences: scoreRelationshipPreferences,
};

export function computeCompatibility(input: CompatibilityInput): CompatibilityResult {
  const subscores = {} as Record<CompatibilityDimension, number | null>;
  const reasons: Array<{ reason: CompatibilityReason; score: number }> = [];

  let weighted = 0;
  let availableWeight = 0;

  for (const dimension of COMPATIBILITY_DIMENSIONS) {
    const { score, reason } = SCORERS[dimension](input);
    subscores[dimension] = score === null ? null : Math.round(clamp01(score) * 100);
    if (score === null) continue;

    const weight = COMPATIBILITY_WEIGHTS[dimension];
    weighted += clamp01(score) * weight;
    availableWeight += weight;

    if (reason && score >= REASON_MIN_SUBSCORE) reasons.push({ reason, score });
  }

  // No usable data on either side: no estimate rather than a fabricated number.
  const score = availableWeight === 0 ? 0 : Math.round((weighted / availableWeight) * 100);

  return {
    score,
    subscores,
    reasons: reasons
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_REASONS)
      .map((item) => item.reason),
  };
}

/** True when the engine had enough data to publish an estimate. */
export function hasEstimate(result: CompatibilityResult): boolean {
  return Object.values(result.subscores).some((value) => value !== null);
}
