# LYVE — Security, Payments, and Admin Architecture

## 1. Security architecture

**Identity**: managed auth (email/phone + OTP), passwords hashed by the provider
(bcrypt/argon2 class), short-lived access tokens with rotating refresh tokens, secure
`HttpOnly` `SameSite` cookies for SSR, session revocation on password change or ban.

**Authorization**: RLS on every table; roles only in `user_roles`; `has_role()` is a
security-definer function; server functions re-check ownership and role. Admin actions
require `ADMIN`+ and 2FA.

**Input**: Zod validation on every server function boundary; parameterized queries only;
strict output field allowlists for public profile reads.

**Abuse control**: per-user and per-IP rate limits on OTP, likes, messages, reports,
uploads, and checkout; velocity anomaly detection; exponential backoff on OTP.

**Files**: private buckets, signed short-lived URLs, MIME/size validation, image
re-encode to strip EXIF/GPS, content scanning before publication.

**Data protection**: sensitive fields encrypted at rest, email/phone stored hashed for
lookup where possible, GPS coarsened to city/10km grid before storage, verification
documents never stored in the app database and never exposed to other users.

**Web**: HTTPS only, HSTS, CSP, XSS-safe rendering (no `dangerouslySetInnerHTML` on user
content), CSRF protection on cookie-authenticated mutations, no secrets in the client
bundle, secrets in environment variables only.

**Observability**: audit logs for auth events, role changes, moderation actions, refunds,
data exports and deletions; alerting on spikes in reports, failed logins, or webhook errors.

**Privacy rights**: consent records, data export, deletion with retention policy,
account deletion soft-deletes then purges.

## 2. Payment architecture

Provider-agnostic layer — **no provider is configured yet**.

```text
billing/
  ports.ts        PaymentProvider interface
  adapters/
    stripe.ts     web subscriptions & one-time (planned first adapter)
    apple.ts      App Store server notifications (future, mobile)
    google.ts     Play RTDN (future, mobile)
    regional.ts   regional PSP slot
  service.ts      plan resolution, checkout, entitlements, refunds
  webhooks.ts     signature verification, idempotent event handling
```

Interface: `createCheckout`, `cancelSubscription`, `refund`, `parseWebhook`,
`syncSubscription`.

Rules:

- Never store card numbers — provider tokens and references only.
- Pricing lives in `subscription_plans` / `plan_prices`, configurable per currency
  and region; nothing hard-coded in code or UI.
- Webhooks are the source of truth; every event is idempotent by `provider_event_id`.
- Entitlements are derived server-side; the client never decides access.
- Purchases supported: subscription, Boost, Super Like packs.
- Track: pending, succeeded, failed, refunded, cancelled, dunning/past-due.
- Mobile digital goods must use Apple/Google billing when native apps ship.

## 3. Admin architecture

Separate authenticated shell at `/admin`, RBAC-gated, 2FA required, no shared accounts.

| Role        | Capabilities                                                           |
| ----------- | ---------------------------------------------------------------------- |
| USER        | none                                                                   |
| MODERATOR   | reports, flagged content, warn/restrict, escalate                      |
| SUPPORT     | user lookup (limited PII), tickets, appeals intake, no bans            |
| ADMIN       | moderation + payments, plans, matching weights, verification decisions |
| SUPER_ADMIN | staff/role management, destructive actions, audit access               |

Screens: Overview KPIs · Users · Moderation queue · Verification · Payments · Plans ·
Matching weights · Analytics · Audit logs · Staff.

Guarantees: least privilege (no blanket database access), every sensitive action writes
`admin_actions` + `audit_logs` with actor, target, before/after, reason; destructive
actions require typed confirmation and are reversible where possible; PII access is
logged and minimized.

## 4. MVP vs Phase 2

**MVP:** auth + age gate + OTP · 14-step onboarding · profile & photos · discovery ·
compatibility engine with admin weights · likes/passes/super likes · matches · realtime
chat with safety detection · report/block/mute/unmatch · basic verification · privacy
settings · notifications (in-app + email) · Premium subscription (single provider) ·
admin dashboard (users, moderation, payments, weights, audit) · EN + AR.

**Phase 2:** external identity verification, Boost marketplace, advanced filters,
incognito refinements, push notifications, profile video, AI compatibility deep insights,
appeals workflow UI, regional payment providers, native app store billing, referrals,
retention analytics, experimentation framework.

**Phase 3:** voice/video intros, events, travel mode, matchmaker-assisted tiers.

## 5. Roadmap

| Phase | Scope                                     | Exit criteria                                 |
| ----- | ----------------------------------------- | --------------------------------------------- |
| 0     | Design system, landing, i18n scaffold     | Landing live, tokens defined                  |
| 1     | Auth, age gate, onboarding, profile       | User can complete a real profile              |
| 2     | Discovery + compatibility + likes/matches | Mutual match creates a conversation           |
| 3     | Chat + safety detection + reporting       | Report → moderation case works end to end     |
| 4     | Premium, plans, entitlements              | Configurable plan gates features correctly    |
| 5     | Admin dashboard + audit + analytics       | Moderator can resolve a case with audit trail |
| 6     | Verification, notifications, hardening    | Security review passed, tests green           |
