# LYVE — Phase 2 Security Audit

**Scope:** Discovery, preferences, like/pass, match, block, report, compatibility & ranking.
**Date:** 2026-08-14 · **Method:** live database + Data API testing with real sessions, plus source review.
**Regression command:** `bun run test:security`

---

## 1. Executive summary

Phase 2 was audited end to end at the database and API level, not through the UI. The
security model holds: the client is never trusted with eligibility, ranking, identity or
projection. All three discovery RPCs derive the viewer from the session, every Phase 2
table is RLS-protected and actor-scoped, and no cross-user read or write was possible in
any of the 119 live Phase 2 tests.

One **HIGH** issue was found and fixed: blocking a member you were already matched with
was rejected by the unmatch state machine, so a safety action silently failed. Two
**LOW** hardening items were also fixed. No CRITICAL findings.

| Severity | Found | Fixed | Open |
| --- | --- | --- | --- |
| CRITICAL | 0 | 0 | 0 |
| HIGH | 1 | 1 | 0 |
| MEDIUM | 0 | 0 | 0 |
| LOW | 3 | 3 | 0 |
| INFO | 3 | n/a | 3 (documented) |

**Regression:** Phase 1 43/43 · Phase 2 119/119 · Compatibility 29/29 · **Total 191/191**.

---

## 2. Scope and threat model

**In scope:** `likes`, `passes`, `matches`, `blocks`, `reports`; the SECURITY DEFINER
functions `discover_candidates`, `likes_received`, `my_matches`; trigger functions
`guard_interaction`, `create_match_on_mutual_like`, `guard_match_update`,
`apply_block_effects`; helpers `is_blocked_pair`, `profile_completeness`,
`approx_distance_km`; the compatibility engine and ranking; photo access after Phase 2.

**Out of scope (not built):** chat, payments, premium, boost, super like, AI APIs, push,
identity verification.

**Adversaries modelled**

1. *Authenticated member with a REST client* — the primary threat. Can craft any Data API
   call, forge ids, replay requests, and manipulate parameters.
2. *Anonymous internet caller* — has the publishable key.
3. *Curious matched member* — wants private fields of someone they can legitimately see.
4. *Blocked or reported member* — wants to bypass a safety control or learn about it.
5. *Ranking gamer* — wants to inflate their position in other people's feeds.

**Assumptions:** the service role key never reaches a browser; Supabase Auth issues and
validates JWTs; `auth.uid()` is trustworthy inside the database.

---

## 3. SECURITY DEFINER review

All three RPCs share one model:

| Property | `discover_candidates` | `likes_received` | `my_matches` |
| --- | --- | --- | --- |
| Viewer source | `auth.uid()` | `auth.uid()` | `auth.uid()` |
| Viewer parameter | none | none | none |
| Other parameters | `p_limit`, `p_offset` (clamped 1–100 / ≥0) | none | none |
| `search_path` | `public` (pinned) | `public` (pinned) | `public` (pinned) |
| Owner | `postgres` | `postgres` | `postgres` |
| EXECUTE | `authenticated`, `service_role` | same | same |
| PUBLIC / `anon` | revoked | revoked | revoked |
| Unauthenticated call | `RAISE insufficient_privilege` | same | same |
| Rows returned | only rows the viewer is entitled to | likes addressed to the viewer | matches the viewer participates in |

Why definer rights are required: the functions must read *other* members' profile,
preference and privacy rows to decide eligibility, which owner-scoped RLS deliberately
forbids. The functions therefore act as a **fixed, non-parameterised query** — there is no
input that can widen the row set, so definer rights cannot be turned into an RLS bypass.

Verified explicitly:

- No parameter accepts a user id (an attempt to pass `p_viewer` errors — no such function).
- `p_limit` is clamped with `least(greatest(coalesce(p_limit,40),1),100)`, `p_offset` with
  `greatest(coalesce(p_offset,0),0)`; huge, negative, null and non-numeric values all fail
  safely and never widen eligibility.
- Errors are literal strings (`UNAUTHENTICATED`) with no schema detail; PostgREST type
  errors mention no internal object.
- Helper functions `is_blocked_pair`, `profile_completeness` and `approx_distance_km` take
  arbitrary arguments, so EXECUTE is granted to `service_role` only. Members calling them
  directly are refused (tested).

The Supabase linter flags all three RPCs as "signed-in users can execute a SECURITY
DEFINER function". That is the intended design for these three and only these three:
they *are* the authorisation boundary for discovery, and each derives its subject from the
session. Accepted and recorded in security memory.

---

## 4. RLS review

RLS is enabled on all five Phase 2 tables. Policies are `TO authenticated` only.

| Table | SELECT | INSERT | UPDATE | DELETE |
| --- | --- | --- | --- | --- |
| `likes` | liker **or** likee (`likes_received` needs it) | `auth.uid() = liker_id` | denied | own row only |
| `passes` | passer only (targets never learn they were passed) | `auth.uid() = passer_id` | denied | own row only |
| `matches` | participants only | **denied** (trigger-only) | participants, further constrained by trigger | **denied** |
| `blocks` | blocker only | `auth.uid() = blocker_id` | denied | blocker only (unblock) |
| `reports` | reporter only | `auth.uid() = reporter_id AND status = 'open'` | **denied** (append-only) | **denied** |

Grants were tightened to match: `INSERT/DELETE` revoked from `authenticated` on `matches`,
`UPDATE/DELETE` revoked on `reports`, and all latent `anon` privileges revoked across every
public table (no anon policy existed, so nothing was reachable — this removes the latent
privilege itself).

Integrity constraints backing the policies: `*_no_self` CHECKs on likes/passes/blocks/reports,
`*_unique_pair` uniques (idempotent duplicates), `matches_ordered_pair` (`profile_a < profile_b`,
so a pair can only exist once), FKs to `profiles` with `ON DELETE CASCADE`.

---

## 5. Trigger review

| Trigger | Timing | Function | Behaviour |
| --- | --- | --- | --- |
| `likes_guard` / `passes_guard` / `blocks_guard` | BEFORE INSERT | `guard_interaction` | Target must exist; for likes/passes the target must not be soft-deleted and the pair must not be blocked. |
| `likes_create_match` | AFTER INSERT | `create_match_on_mutual_like` | Inserts the ordered pair when the reverse like exists, `ON CONFLICT DO NOTHING`. Atomic with the like; duplicates impossible. |
| `matches_guard_update` | BEFORE UPDATE | `guard_match_update` | Pins `id`, both participants and `created_at`; allows only `active → unmatched` by a participant (plus block-driven `→ blocked`); stamps `ended_by`/`ended_at` server-side; clears likes and writes mutual passes so an unmatched pair cannot silently re-match. |
| `blocks_apply_effects` | AFTER INSERT | `apply_block_effects` | Deletes likes in both directions and moves any match to `blocked`. |
| `matches_set_updated_at` / `reports_set_updated_at` | BEFORE UPDATE | `set_updated_at` | Timestamp only. |

All trigger functions are SECURITY DEFINER with `search_path = public`, are not directly
callable by members, and take no client-controlled arguments beyond the row itself — every
field they trust (`auth.uid()`, `OLD.*`) is server-derived.

---

## 6. Findings

### F-1 · HIGH · Blocking a matched member failed (fixed)

`apply_block_effects` updated the match to `blocked`, which fired `guard_match_update`.
Because the actor was a participant, the guard evaluated the transition against the
unmatch state machine, saw `active → blocked`, and raised — rolling back the whole block
insert. A member could therefore not block someone they were matched with: a safety
control silently failing is a HIGH severity issue.

**Fix:** the guard now explicitly permits `→ blocked` when a block row genuinely exists
for the pair (`is_blocked_pair`), stamping `ended_by`/`ended_at` server-side. Every other
transition remains forbidden — re-activating an ended match, forging `ended_by`, changing
participants and unmatching someone else's match are all still rejected (tested).

### F-2 · LOW · Latent `anon` table privileges (fixed)

Every public table still carried Supabase's default `anon` grants. RLS blocked all access
(no anon policy exists anywhere), so nothing was reachable, but a future permissive policy
would have inherited the privilege. All `anon` grants revoked.

### F-3 · LOW · Ranking accepted an out-of-range completeness value (fixed)

`rankingScore` multiplied `row.completeness` straight from the row. The value is produced
server-side by `profile_completeness`, so it cannot be forged today, but the function had
no bound of its own. It is now clamped to 0–1 (`clampUnit`), and future-dated activity was
already capped at 1.

### F-4 · LOW · Missing supporting indexes (fixed)

Added `reports_reporter_idx (reporter_id, created_at DESC)` and a partial
`profiles_last_active_idx (last_active_at DESC) WHERE deleted_at IS NULL`.

### INFO-1 · Three RPCs are executable by signed-in users

Intended and required; see §3. Recorded in security memory so future scans do not
re-raise it.

### INFO-2 · Likees can see who liked them

`likes.likee_id` is readable by the recipient — that is the "Likes you" product surface,
not a leak. Passers remain invisible to their targets.

### INFO-3 · Report status is visible to its author

A reporter can read their own report row including `status`. No moderator notes, internal
fields, or other members' reports exist in the table, so no moderation information leaks.

---

## 7. Safe projection audit

**Database allowlist** returned by the three RPCs (verified field-by-field in the suite —
any new column fails the test):

`profile_id, first_name, age, city, country, distance_km, relationship_intent, bio,
interest_slugs, photo_paths, smoking, drinking, exercise, children, social_energy,
communication_style, they_want_my_age, they_want_my_gender, they_want_my_intent,
completeness, last_active_at` (+ `liked_at`, `match_id`, `matched_at`).

**Browser allowlist** (`DiscoveryCard`, built by `toDiscoveryCard`):

`profileId, firstName, age, city, country, distanceBucketKm, intent, interestSlugs, bio,
photoUrls, compatibility`.

Dropped at the server boundary and never sent to a browser: `photo_paths` (replaced by
short-lived signed URLs), `completeness`, `last_active_at`, the three `they_want_my_*`
ranking booleans, and the raw kilometre distance (bucketed to ≥5 km steps, capped at 500).
Never present at any layer: email, phone, auth ids other than the profile id needed to
like/block, raw coordinates, storage paths, preferences, privacy settings, moderation or
report data, deleted-account metadata.

Signed photo URLs are minted server-side only, after the database confirmed eligibility,
with a 30-minute TTL, capped at 3 photos per card. Expired URLs are rejected (tested).

---

## 8. Discovery, like/pass, match, block, report reviews

**Discovery** — eligibility is entirely server-side: adult, not soft-deleted, discoverable,
`profile_visibility = 'everyone'`, not blocked either way, not already liked/passed/matched,
inside *both* members' age, gender, intent and distance preferences. The caller is always
excluded. The only client input is a page number, clamped to 0–50 in the server function
and again in SQL. Manipulating pagination or filters cannot surface a hidden, deleted or
blocked profile (tested).

**Like / pass** — self, duplicate, forged actor, forged/absent target, malformed UUID, null
target, deleted target and blocked-pair attempts are all rejected. Likes and passes cannot
be modified or deleted across users. Passes are invisible to their targets.

**Match** — clients cannot insert or delete match rows at all; matches exist only as the
atomic result of a genuine mutual like, one per ordered pair. Participants may perform
exactly one transition (`active → unmatched`); ownership, timestamps and `ended_by` are
server-stamped. Repeat unmatch is a no-op; reviving a match is rejected; unmatching writes
mutual passes so the pair does not silently re-match.

**Block** — immediately deletes likes both ways and ends any match, and hides each member
from the other's discovery and likes. Neither side can create new likes afterwards. The
blocked member cannot see, modify or delete the block; blocking back is allowed; the
blocker can unblock their own row. Self-block, duplicate block and forged actor are rejected.

**Report** — append-only for the reporter, invisible to the reported member and to every
other member, and un-enumerable. Self-report, forged reporter, unknown category,
pre-set status and oversized descriptions are rejected. No moderation state appears in any
discovery payload.

---

## 9. Compatibility and ranking review

The engine is a pure function of two profile fact sets, with all weights in
`src/config/compatibility.ts`. Verified: weights sum to 1; scoring is deterministic and
integral in 0–100; missing dimensions are dropped and their weight redistributed without
producing NaN or out-of-range values; a pair with no data yields no estimate rather than a
fabricated number. No protected characteristic (gender, religion, ethnicity, nationality,
race) and no popularity signal participates in scoring or ranking — gender is used only as
a hard eligibility filter expressing what each member asked for. Reasons carry only facts
already visible on the card (shared interests, shared intent, city/country) and never the
other member's preferences or age range. Adversarial input — NaN, ±Infinity, negative ages
and distances, 5 000-element interest arrays, SQL/HTML strings as enum values — stays finite
and in range.

Ranking (`compatibility 0.6 / completeness 0.25 / recency 0.15`) runs server-side on rows
the database produced; the client submits no scores, weights or activity values and cannot
write another member's `last_active_at`, completeness inputs or preferences (tested).

---

## 10. Performance review

Indexes present and used by the Phase 2 paths: `likes_unique_pair`, `likes_likee_idx`,
`passes_unique_pair`, `passes_passer_idx`, `blocks_unique_pair`, `blocks_blocked_idx`,
`matches_unique_pair`, `matches_participant_a_idx`, `matches_participant_b_idx`,
`profiles_discovery_idx`, `profiles_deleted_at_idx`, plus the two added here
(`reports_reporter_idx`, `profiles_last_active_idx`).

The browser never loads a table: discovery fetches a 40-row pool server-side, scores it and
returns 10 cards with a `nextPage` cursor; `likes_received` is capped at 100 rows and
`my_matches` at 200. Block filtering is a single indexed `EXISTS` over `blocks`. Noted for a
later phase, not optimised now: `profile_completeness` is evaluated twice per candidate row
(projection + ORDER BY), and offset paging will need a keyset cursor at large scale.

---

## 11. Fixes applied

1. `guard_match_update` — allow a genuine block to end a match (F-1, HIGH).
2. `apply_block_effects` — recreated with the same semantics under the corrected guard.
3. Revoked all `anon` grants on every public table (F-2).
4. Revoked `INSERT/DELETE` on `matches` and `UPDATE/DELETE` on `reports` from `authenticated`.
5. `rankingScore` clamps completeness to 0–1 (F-3).
6. Added `reports_reporter_idx` and `profiles_last_active_idx` (F-4).

## 12. Residual risks

- The 30-day hard purge of soft-deleted accounts is still manual (carried over from Phase 1).
- Report handling has no moderation surface yet; reports accumulate un-triaged until the
  admin phase.
- Upload size is enforced client-side only; MIME/extension is enforced in storage policy.
- Offset-based discovery paging is adequate at current scale; revisit with a keyset cursor.
- Rate limiting on likes/reports is not implemented — a member can automate interactions
  within RLS limits. Planned with premium/limits work.

## 13. Regression results

```
Phase 1 (database, auth, storage, RLS):                    43/43 passed
Phase 2 (discovery, like/pass, match, block, report):    119/119 passed
Phase 2 (compatibility & ranking integrity):               29/29 passed
TOTAL:                                                   191/191 passed, 0 failed
```

Suites: `tests/security/rls-audit.ts`, `tests/security/phase2-audit.ts`,
`tests/security/compatibility-audit.ts`, run together by `tests/security/run-all.ts`
(`bun run test:security`). No existing test was removed or weakened.
