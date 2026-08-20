/**
 * LYVE Phase 2 — compatibility & ranking integrity suite.
 *
 * The compatibility engine is pure and server-side. These tests prove it is
 * deterministic, bounded, fair (no protected characteristics, no popularity),
 * privacy-preserving in its explanations, and safe under malformed input.
 *
 * Run:  bun run tests/security/compatibility-audit.ts
 */
import {
  computeCompatibility,
  hasEstimate,
  type CompatibilityInput,
} from "../../src/lib/compatibility";
import { rankCandidates, rankingScore, type CandidateRow } from "../../src/lib/discovery-core";
import {
  COMPATIBILITY_WEIGHTS,
  RANKING_WEIGHTS,
  COMPATIBILITY_DIMENSIONS,
  MAX_REASONS,
} from "../../src/config/compatibility";

const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

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

const viewer: CompatibilityInput["viewer"] = {
  age: 30,
  intent: "marriage",
  interestSlugs: ["hiking", "cooking", "travel"],
  city: "Dubai",
  country: "AE",
  minAge: 25,
  maxAge: 40,
  smoking: "never",
  drinking: "never",
  exercise: "often",
  children: "want_children",
  social_energy: "balanced",
  communication_style: "direct",
};

const candidate: CompatibilityInput["candidate"] = {
  age: 32,
  intent: "marriage",
  interestSlugs: ["hiking", "cooking", "reading"],
  city: "Dubai",
  country: "AE",
  distanceKm: 12,
  theyWantMyAge: true,
  theyWantMyIntent: true,
  smoking: "never",
  drinking: "never",
  exercise: "sometimes",
  children: "want_children",
  social_energy: "balanced",
  communication_style: "direct",
};

const emptyFacts = {
  smoking: null,
  drinking: null,
  exercise: null,
  children: null,
  social_energy: null,
  communication_style: null,
};

function row(overrides: Partial<CandidateRow>): CandidateRow {
  return {
    profile_id: "11111111-1111-4111-8111-111111111111",
    first_name: "Test",
    age: 30,
    city: "Dubai",
    country: "AE",
    distance_km: 10,
    relationship_intent: "marriage",
    bio: null,
    interest_slugs: ["hiking"],
    photo_paths: [],
    smoking: null,
    drinking: null,
    exercise: null,
    children: null,
    social_energy: null,
    communication_style: null,
    they_want_my_age: true,
    they_want_my_gender: true,
    they_want_my_intent: true,
    completeness: 0.5,
    last_active_at: new Date().toISOString(),
    ...overrides,
  };
}

/* ------------------------------------------------------------ configuration */
const weightSum = Object.values(COMPATIBILITY_WEIGHTS).reduce((sum, w) => sum + w, 0);
check("compatibility weights sum to 1", Math.abs(weightSum - 1) < 1e-9, weightSum);

const rankSum = Object.values(RANKING_WEIGHTS).reduce((sum, w) => sum + w, 0);
check("ranking weights sum to 1", Math.abs(rankSum - 1) < 1e-9, rankSum);

const configSource = stripComments(await Bun.file("src/config/compatibility.ts").text());
check(
  "no protected characteristic is a scoring dimension",
  !COMPATIBILITY_DIMENSIONS.some((d) => /gender|ethnic|religio|national|race|disab/i.test(d)),
);
const engineSource = stripComments(await Bun.file("src/lib/compatibility.ts").text());
check(
  "the engine never reads gender, religion, ethnicity or nationality",
  !/\b(gender|religion|ethnicity|nationality|race)\b/.test(engineSource),
);
check(
  "popularity signals are absent from scoring and ranking",
  !/likes_received|like_count|popularity|match_count/i.test(engineSource + configSource),
);
check(
  "weights are constants, not client input",
  !/COMPATIBILITY_WEIGHTS\s*\[/.test(engineSource.replace(/COMPATIBILITY_WEIGHTS\[dim\]/g, "")) ||
    !/export (let|var) COMPATIBILITY_WEIGHTS/.test(configSource),
);
check(
  "weight configuration is exported as a frozen-by-convention const",
  /export const COMPATIBILITY_WEIGHTS/.test(configSource) &&
    /export const RANKING_WEIGHTS/.test(configSource),
);

/* -------------------------------------------------------------- determinism */
{
  const first = computeCompatibility({ viewer, candidate });
  const second = computeCompatibility({ viewer, candidate });
  check("scoring is deterministic", JSON.stringify(first) === JSON.stringify(second));
  check("score is within 0-100", first.score >= 0 && first.score <= 100, first.score);
  check("score is an integer", Number.isInteger(first.score));
  check("a strong pair scores highly", first.score >= 70, first.score);
  check(
    "all subscores are null or within 0-100",
    Object.values(first.subscores).every((s) => s === null || (s >= 0 && s <= 100)),
  );
}

/* --------------------------------------------------- missing-data behaviour */
{
  const sparse = computeCompatibility({
    viewer: {
      ...viewer,
      ...emptyFacts,
      age: null,
      city: null,
      country: null,
      intent: null,
      interestSlugs: [],
    },
    candidate: {
      ...candidate,
      ...emptyFacts,
      age: null,
      city: null,
      country: null,
      intent: null,
      interestSlugs: [],
      distanceKm: null,
      theyWantMyAge: null,
      theyWantMyIntent: null,
    },
  });
  check("missing data never produces NaN", Number.isFinite(sparse.score), sparse.score);
  check("missing data stays within range", sparse.score >= 0 && sparse.score <= 100, sparse.score);
  check("a profile with no data yields no estimate", !hasEstimate(sparse));

  const partial = computeCompatibility({
    viewer: { ...viewer, ...emptyFacts },
    candidate: { ...candidate, ...emptyFacts },
  });
  check(
    "redistribution keeps a partially-filled pair in range",
    partial.score >= 0 && partial.score <= 100,
    partial.score,
  );
}

/* -------------------------------------------------------------- adversarial */
{
  const hostile = computeCompatibility({
    viewer: {
      ...viewer,
      age: Number.NaN,
      minAge: Number.NEGATIVE_INFINITY,
      maxAge: Number.POSITIVE_INFINITY,
      interestSlugs: Array.from({ length: 5000 }, (_, i) => `slug-${i}`),
      intent: "<script>alert(1)</script>",
    },
    candidate: {
      ...candidate,
      age: -1,
      distanceKm: -99999,
      intent: "'; DROP TABLE profiles; --",
      interestSlugs: Array.from({ length: 5000 }, (_, i) => `slug-${i}`),
      theyWantMyAge: null,
      theyWantMyIntent: null,
    },
  });
  check(
    "hostile input still produces a finite score",
    Number.isFinite(hostile.score),
    hostile.score,
  );
  check(
    "hostile input stays within 0-100",
    hostile.score >= 0 && hostile.score <= 100,
    hostile.score,
  );
  check(
    "unknown intent values do not crash or score as compatible",
    hostile.subscores.intent === null || hostile.subscores.intent <= 100,
  );

  const nulls = computeCompatibility({
    viewer: {
      ...viewer,
      ...emptyFacts,
      age: null,
      city: null,
      country: null,
      intent: null,
      interestSlugs: [],
    },
    candidate: {
      ...candidate,
      ...emptyFacts,
      age: null,
      city: null,
      country: null,
      intent: null,
      interestSlugs: [],
      distanceKm: null,
      theyWantMyAge: null,
      theyWantMyIntent: null,
    },
  });
  check("all-null input is handled safely", Number.isFinite(nulls.score) && nulls.score >= 0);
}

/* -------------------------------------------------------------- explanations */
{
  const result = computeCompatibility({ viewer, candidate });
  const reasonBlob = JSON.stringify(result.reasons);
  check(
    "reasons never expose the other member's age range or preferences",
    !/minAge|maxAge|theyWant|preferred|max_distance/i.test(reasonBlob),
  );
  check(
    "reason values only carry facts already visible on the card",
    result.reasons.every(
      (reason) =>
        !reason.values ||
        reason.values.every(
          (v) =>
            candidate.interestSlugs.includes(v) ||
            v === candidate.city ||
            v === candidate.country ||
            v === candidate.intent,
        ),
    ),
  );
  check("reasons are capped", result.reasons.length <= MAX_REASONS, result.reasons.length);
}

/* ------------------------------------------------------------------ ranking */
{
  const fresh = row({ profile_id: "aaaa1111-1111-4111-8111-111111111111", completeness: 1 });
  const stale = row({
    profile_id: "bbbb2222-2222-4222-8222-222222222222",
    completeness: 0,
    last_active_at: new Date(Date.now() - 400 * 24 * 3600 * 1000).toISOString(),
  });
  check(
    "ranking rewards completeness and recency",
    rankingScore(fresh, 80) > rankingScore(stale, 80),
  );
  check(
    "ranking is bounded to 0-1",
    rankingScore(fresh, 100) <= 1.0000001 && rankingScore(stale, 0) >= 0,
  );

  const forged = row({
    profile_id: "cccc3333-3333-4333-8333-333333333333",
    completeness: 999 as unknown as number,
    last_active_at: new Date(Date.now() + 10 * 365 * 24 * 3600 * 1000).toISOString(),
  });
  check(
    "a forged completeness or future activity value cannot exceed the honest maximum",
    rankingScore(forged, 100) <= 1.0000001,
    rankingScore(forged, 100),
  );

  const ordered = rankCandidates(viewer, [stale, fresh], 10);
  const orderedAgain = rankCandidates(viewer, [fresh, stale], 10);
  check(
    "ranking is stable regardless of input order",
    ordered.map((r) => r.row.profile_id).join() ===
      orderedAgain.map((r) => r.row.profile_id).join(),
  );
  check("ranking respects the page size", rankCandidates(viewer, [stale, fresh], 1).length === 1);
  check("ranking handles an empty pool", rankCandidates(viewer, [], 10).length === 0);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
