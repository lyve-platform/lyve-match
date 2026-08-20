# LYVE — Phase 4 Security Audit (Trust & Safety, Admin, Moderation)

**Scope:** RBAC, admin console, account states, report → case pipeline, moderation
actions, immutable audit trail, safety signals, appeals, and 30-day purge.
**Suite:** `tests/security/phase4-audit.ts` — 90 assertions, all passing.
**Full regression:** 378 assertions across Phases 1–4, all passing
(`bun run tests/security/run-all.ts`).

## Findings and fixes

| #   | Severity | Finding                                                                                                                                 | Fix                                                                                                                             |
| --- | -------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1   | HIGH     | The case-opening trigger cast `source` as text, so **every profile and message report failed** and no moderation case could be created. | Explicit cast to `moderation_source`; reporting and case creation verified end to end.                                          |
| 2   | MEDIUM   | Granting an appeal recorded the decision but left the account restricted/banned, so a successful appeal had no effect.                  | Granting now restores the account to good standing, dismisses open cases, and writes a separate `ACCOUNT_RESTORED` audit entry. |

## Verified properties

**RBAC** — roles live only in `user_roles`; `profiles` has no role column; a member
cannot grant themselves a role, cannot read other members' roles, and anonymous
callers see nothing in `user_roles` or `role_permissions`. Permissions are resolved
server-side through `has_permission`; the UI only hides controls.

**Admin surface** — every admin routine (`admin_metrics`, `admin_list_users`,
`admin_list_cases`, `admin_list_audit`, `admin_list_appeals`, `admin_case_reports`,
`admin_moderate_account`, `admin_update_case`, `admin_decide_appeal`,
`admin_set_role`) refuses non-staff members and anonymous callers, and enforces the
specific permission it needs. Support is read-only: it cannot ban, cannot change case
state, cannot read the audit log, and never sees reporter identities. Moderators may
restrict/suspend/restore but not ban. Staff cannot action their own account.

**Data minimisation** — admin projections expose no email, phone, credentials,
coordinates or message bodies; identifiers, counts, status and moderation state only.

**Account states** — `account_status` and `suspended_until` are server-owned: a member
cannot promote themselves and a banned member cannot self-restore. Restricted,
suspended and banned accounts are excluded from discovery, cannot like, and cannot
send messages; other members no longer see them in the feed.

**Audit trail** — every moderation and appeal action writes an entry with actor,
action code, target and reason. Entries are append-only: UPDATE and DELETE are
rejected **even with the service role**. Members and anonymous callers cannot read it.

**Safety engine** — deterministic, local, non-AI. It is advisory: it never blocks
delivery, never notifies anyone, and never enforces on its own. Signals are staff-only;
members cannot read or forge them. Medium/high risk raises case priority for human review.

**Appeals** — only an account not in good standing may appeal, one open appeal at a
time, never on behalf of another member, and a member cannot decide their own appeal.
Decisions are restricted to `appeals.decide`.

**Purge** — `purge_expired_accounts` is a trusted job with a dry-run mode; members,
moderators and anonymous callers are all refused.

## Residual risks (accepted, non-blocking)

- Staff 2FA is enforced by the identity provider, not yet by the app shell.
- Rate limiting on reports and appeals relies on database uniqueness constraints
  rather than a dedicated limiter.
- The safety engine is heuristic and English/Arabic keyword based; it will miss
  paraphrase and obfuscation. It exists to prioritise human review, nothing more.
- Linter warns that admin routines are executable by signed-in users; this is
  intentional — each routine authorises the caller internally via `require_permission`.
