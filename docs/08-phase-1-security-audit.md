# LYVE — Phase 1 Security, Database, Auth, Storage & RLS Audit

Scope: Phase 1 only (foundation, authentication, database, profiles, photos, onboarding, privacy, account deletion). No Phase 2 features were added. No visual/design changes were made.

Method: live inspection of the production schema, policies and storage configuration; static review of all client data-access code; and an executable end-to-end test suite that drives the real Data API and Storage API as two independent signed-in users plus an anonymous caller.

Result: **43/43 automated security tests pass.** Three issues were found and fixed during the audit. No critical or high issues remain open.

---

## 1. Database audit

| Area         | Finding                                                                                                                                                                                                                          |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tables       | `profiles`, `profile_photos`, `interests`, `profile_interests`, `preferences`, `privacy_settings`, `onboarding_progress`, `account_deletion_requests` — all in `public`, all with primary keys.                                  |
| Foreign keys | Every child table references `profiles(id)` with `ON DELETE CASCADE`; `profiles.id` references the auth user with cascade. `profile_interests.interest_id` references `interests(id)`.                                           |
| Constraints  | 18+/≤120 date-of-birth range, `max_age >= min_age`, age bounds [18, 120], bio/name/occupation length limits, max photos per profile, unique `profile_photos.storage_path`, one primary photo per profile (partial unique index). |
| Enums        | `gender_type`, `relationship_intent`, `profile_visibility`, `message_audience`, `deletion_request_status` — no free-text substitutes.                                                                                            |
| Timestamps   | `created_at` / `updated_at` on every table, with `set_updated_at` BEFORE UPDATE triggers.                                                                                                                                        |
| Indexes      | Primary keys, foreign-key columns, and the partial primary-photo index are present; no unindexed hot path at Phase 1 data volume.                                                                                                |
| Grants       | `authenticated` and `service_role` hold Data API grants on every public table; access is gated by RLS.                                                                                                                           |
| Orphans      | None. Deleting an auth user cascades to profile, photos, interests, preferences, privacy settings, onboarding progress and deletion requests.                                                                                    |

## 2. RLS audit

RLS is **enabled on all eight** public tables, and every policy is scoped to `auth.uid()`.

- `profiles`, `profile_photos`, `preferences`, `privacy_settings`, `onboarding_progress` — select/insert/update (and delete where meaningful) restricted to the owner.
- `profile_interests` — owner-scoped insert/select/delete; no update path.
- `account_deletion_requests` — owner-scoped insert/select; update restricted to cancellation (see §7); no delete.
- `interests` — read-only reference data, readable by signed-in users only when `is_active`.
- No `USING (true)` policy exists on any user-owned table. `anon` has no policy on any table, so anonymous Data API reads return zero rows on every table.

Verified by test, not by inspection alone: user A cannot read or write **any** row belonging to user B, across all tables, for select, insert, update and delete.

## 3. Storage audit

- Bucket `profile-photos` is **private**; there is no public URL path to any photo.
- Object policies scope every operation to `bucket_id = 'profile-photos'` and a first path segment equal to `auth.uid()`, so files live under `<user-id>/…` and are unreachable across users.
- Photos are served to their owner through short-lived signed URLs (30 minutes), generated per request.
- Verified: A cannot upload into B's folder, download B's object, sign a URL for B's object, or delete B's object; anonymous download fails.

**Fixed during audit (HIGH):** the bucket accepted arbitrary file types — an HTML or SVG payload could be stored under the user's own folder. Upload/update policies now additionally require a `jpg`, `jpeg`, `png` or `webp` extension.

**Known limitation (LOW, documented):** a per-object byte limit is not enforceable from a storage policy. The client enforces a 5 MB cap; a determined user could store a larger image in their own private folder. Recommend adding a bucket-level size limit when platform configuration exposes it.

## 4. Authentication audit

- Email/password sign-up and sign-in only; no anonymous sign-in.
- Password reset uses `resetPasswordForEmail` with a same-origin `/reset-password` redirect; that page sets the new password through the auth API and is public by design.
- The protected area lives under `_authenticated`, whose client-side gate calls `getUser()` (server-revalidated) and redirects to `/auth`.
- Session tokens live in the auth client's own storage; the app never reads, logs or forwards them.
- Verified: a forged/expired bearer token is rejected by the Data API.
- Confirmed by code review: **no service-role key, no admin client, and no secret is reachable from browser code.** Only the publishable key is exposed, as intended.

## 5. Age-gate (18+) audit

Enforced in three independent layers:

1. **UI** — date-of-birth field blocks under-18, impossible and future dates before submit.
2. **Database trigger** `enforce_adult_date_of_birth` on `profiles` INSERT and UPDATE — rejects any date under 18 or over 120 years, including a later downgrade attempt.
3. **New:** trigger `enforce_dob_before_completion` on `onboarding_progress` — onboarding cannot be marked complete for an account with no (or an underage) date of birth.

Verified by test: 17 y 364 d rejected, exactly 18 accepted, future date rejected, 150 years rejected, post-signup downgrade rejected.

**Fixed during audit (MEDIUM):** previously a caller hitting the API directly could leave `date_of_birth` null and still flag onboarding complete, bypassing the gate. Layer 3 closes that path.

## 6. Onboarding audit

- Progress is stored per user in `onboarding_progress` (current step, completed steps, completion flag) and is resumable after sign-out.
- Every step writes only owner-scoped rows; A cannot advance or complete B's onboarding (tested).
- Completion now additionally requires a verified adult date of birth (§5).

## 7. Account deletion audit

- Deletion is a **soft delete**: `profiles.deleted_at` is stamped and a row is written to `account_deletion_requests` with `scheduled_purge_at = now() + 30 days`.
- Soft-deleted profiles are invisible to other users and to anonymous callers (tested).
- Users can cancel a pending request within the window.

**Fixed during audit (MEDIUM):** the owner-update policy allowed rewriting **any** column of their deletion request — including pushing `scheduled_purge_at` years out or self-marking the request `completed`. A guard trigger now freezes `profile_id`, `requested_at`, `scheduled_purge_at` and `created_at`, and permits only the `pending → cancelled` transition for the owner. A partial unique index also prevents multiple simultaneous pending requests.

**Open item (MEDIUM, deliberately not implemented in Phase 1):** the 30-day hard purge is not yet automated. Pending requests accumulate correctly and are queryable, but no scheduled job erases the data at day 30. This needs a scheduled purge job (auth user deletion + storage object removal, cascade handles the rest) — recommended as a small Phase 1.1 item before public launch, since it is a data-retention commitment rather than an access-control hole.

## 8. Privacy & PII audit

- PII in scope: first name, date of birth, gender, country/city (coarse, no GPS), bio, occupation, education, intent, photos.
- **Not collected or stored anywhere:** phone number, exact address, GPS coordinates, payment data — consistent with the product rules.
- Email lives only in the auth system and is never copied into `public` tables, never rendered for other users, and never logged.
- Privacy settings (visibility, online status, read receipts, discoverability, message audience) are owner-only rows, ready for Phase 2 enforcement at query level.
- Client logging reviewed: no PII, tokens or identifiers are written to the console anywhere in the app.

## 9. API / client audit

- All data access goes through the browser client with the publishable key and user session; every query is RLS-constrained.
- No server functions expose privileged data; the service-role client is unused by application code.
- Inputs are validated with Zod on the client and re-constrained by database check constraints and enums server-side.
- No secret is referenced in client code; environment access is limited to the public `VITE_` variables.

## 10. Test suite

`tests/security/rls-audit.ts` (run with `bun run test:security`) creates two throwaway accounts, exercises the real APIs, and asserts 43 security properties across:

- age-gate bypass attempts (5)
- cross-user reads (5) and cross-user writes/forgeries (7)
- storage isolation, file-type restriction and anonymous access (9)
- anonymous Data API reads and writes (9)
- soft-delete visibility and deletion-request tampering (5)
- invalid token rejection, plus owner happy paths (3)

The service-role key is used only to create and delete the test accounts; the application itself never uses it.

## 11. Summary of fixes applied

| Severity | Issue                                                                     | Fix                                                                   |
| -------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| HIGH     | Photo bucket accepted any file type (HTML/SVG payloads)                   | Storage insert/update policies now require an image extension         |
| MEDIUM   | Deletion request fields fully rewritable by owner (purge date, status)    | Guard trigger; owner may only cancel; single pending request enforced |
| MEDIUM   | Onboarding could complete with no date of birth (age-gate bypass via API) | Trigger requiring a verified adult date of birth before completion    |

Remaining open items: automated 30-day purge job (MEDIUM), bucket-level upload size limit (LOW). Both are recorded above and neither is an access-control weakness.
