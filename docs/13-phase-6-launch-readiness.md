# Phase 6 — Launch Readiness & Production Payments: Architecture Proposal

Status: **proposal only**. No production database change, no payment provider connection, no store submission. Nothing in this document is implemented until you approve it.

---

## 1. Target launch markets and country configuration

Recommended launch shape: a small **Tier 1** set first, then widen.

| Wave | Markets | Rationale |
| --- | --- | --- |
| Wave 1 (soft launch) | UAE, Saudi Arabia, Qatar, Kuwait, Bahrain, Oman | Core audience, EN + AR both first-class, single currency band (AED/SAR), one legal review |
| Wave 2 | UK, Germany, France, Netherlands, Sweden | GDPR-mature, high dating ARPU, strong card + wallet coverage |
| Wave 3 | US, Canada, Australia | Largest volume, but heaviest legal/consumer-protection surface (US state privacy laws) |
| Deferred | India, Indonesia, Turkey, Brazil, Nigeria | Local payment rails and pricing require separate work |
| Blocked | Sanctioned jurisdictions and any market where the product is legally unsafe to operate | Compliance |

**Country configuration** is data, not code. A `countries` config table drives, per ISO country code: availability (`live` / `waitlist` / `blocked`), default locale and text direction, currency, minimum age (18 global, higher where local law requires), tax treatment, active legal document versions, and which payment methods are offered. Client code never hard-codes a country rule; it reads the resolved config. Country is derived server-side (edge geo + account country of record), never from a client-supplied header alone.

## 2. Web vs iOS vs Android billing architecture

Three purchase channels, one entitlement truth.

```text
  Web checkout        iOS IAP            Android Billing
   (provider)      (App Store)          (Google Play)
        |                |                     |
   webhook          server-side           Real-time
   (signed)         notifications        Developer Notifications
        \_______________ | _____________________/
                         v
              billing_apply_subscription
                         v
                    entitlements   <- the only thing the app reads
```

Rules:
- The existing provider abstraction from Phase 5 gains two more providers (`apple`, `google`). No feature gate ever learns which channel paid.
- **Apple and Google require their own IAP for digital subscriptions inside their apps.** No external checkout link, no price steering inside the app binary, in the launch build.
- Receipts and purchase tokens are validated **server-side** against Apple/Google APIs; the client's word is never trusted.
- Cross-channel restore: an account already Premium via web keeps Premium in the apps (read-only state, "managed on the web"), and vice versa. The UI must show *where* a subscription is managed and deep-link to the right cancellation surface.
- Store-mandated pricing tiers differ from web pricing. Expect ~30% (or 15% small-business) store commission and set web pricing accordingly, without violating anti-steering rules inside the app.

## 3. Payment provider options and tradeoffs

| Option | Strengths | Tradeoffs | Fit for LYVE |
| --- | --- | --- | --- |
| **Stripe** | Best-in-class API, subscriptions, strong SCA/3DS, wide method coverage, good dispute tooling | You are merchant of record: you own VAT/sales-tax registration and remittance (Stripe Tax reduces but does not remove this) | Strong fit if you have or will get a UAE/EU entity and accept tax duty |
| **Paddle** | Merchant of record — Paddle owns global VAT/GST/sales tax, invoicing, and much of chargeback handling | Less flexible subscription primitives, higher effective rate, stricter content review for dating | Strong fit if you want to avoid multi-country tax registration |
| **Apple / Google IAP** | Mandatory in-app; frictionless conversion; store handles tax and refunds | 15–30% commission, no customer data, refund decisions out of your control | Required, not optional, for the mobile apps |
| Regional (Tap, Checkout.com, Network Intl.) | Local GCC methods (mada, KNET, Apple Pay local acquiring), better auth rates in-region | Extra integration, no single global subscription model | Consider as an added web method in Wave 1, not the primary rail |

**Recommendation:** Paddle for web if you want tax handled for you and a lean team; Stripe for web if you want maximum control and already have tax capability. Either way, Apple + Google for the mobile apps. Because Phase 5 is provider-agnostic, this decision is reversible and does not touch entitlement logic.

## 4. Subscription plans and entitlement strategy

Keep the plan set small and honest.

- **Free** — discovery, limited daily likes, matches, messaging with matches, all safety features. Safety is never paywalled.
- **Premium** — who liked you, compatibility insights, advanced preferences, rewind, unlimited/raised likes, read receipts control.
- **Premium+ (Phase 7 candidate)** — priority visibility, weekly boosts, travel/global discovery. Do **not** ship at launch; prove Premium first.
- **Consumables** (boosts, super-likes) — deferred; they add refund and store-accounting complexity.

Billing periods: monthly, 3-month, 12-month, with the discount shown as a real per-month figure. Intro offers only where store rules and local consumer law allow. Entitlements remain the single read surface — plan changes are a mapping table (`plan_code → entitlement keys`), never new `if` statements in feature code.

## 5. Currency and localization architecture

- **Price books, not FX math.** Each plan has explicit, human-approved prices per currency, with psychologically sane rounding. Never multiply a USD price by a live FX rate at runtime.
- Launch currencies: AED, SAR, USD, EUR, GBP. Everything else falls back to USD until a price book entry exists.
- Currency is chosen from the account's country of record, then locked for the life of the subscription; a country change creates a new subscription rather than silently repricing.
- Display: `Intl.NumberFormat` with the user's locale; Arabic uses Arabic-Indic digits only if that is the confirmed preference, RTL layout everywhere.
- Tax: prices displayed **inclusive** of VAT in GCC/EU markets, exclusive where that is the local norm (US). Invoices are generated by the provider, never hand-rolled.
- All billing UI strings go through the existing `en.billing.ts` / `ar.billing.ts` files; no untranslated provider text is shown to the user.

## 6. Refund, cancellation and chargeback handling

- **Cancellation** never revokes access immediately: the subscription enters `cancel_at_period_end`, entitlement expires at period end, and the UI states the exact end date. One-tap cancel on web; store-managed cancel deep-links for iOS/Android.
- **Refunds** follow a written policy: statutory cooling-off honoured where law requires (EU/UK 14 days unless service was consumed with consent), goodwill refunds at staff discretion inside a bounded window, no refunds for accounts terminated for safety violations. Refund events revoke entitlement through the existing ledger path.
- **Store refunds** are decided by Apple/Google; we react to their notifications, we do not argue with them in-app.
- **Chargebacks**: automatic entitlement revocation plus account flag; evidence packs (consent timestamp, IP, usage log, terms version accepted) are assembled from existing audit data. Repeat chargeback accounts are blocked from repurchase.
- Every one of these paths already has a lifecycle event type in the Phase 5 ledger; Phase 6 adds operator tooling and policy text, not new state machines.

## 7. App Store and Google Play considerations

Dating apps get elevated review scrutiny. Prepare before submitting:
- Age rating 18+, and an actual enforced age gate (already implemented).
- In-app reporting and blocking reachable within two taps (already implemented) — reviewers check this.
- Account deletion available **in-app**, self-service, mandatory for both stores (already implemented; verify the flow end-to-end).
- Privacy nutrition labels / Play Data Safety form must match reality exactly, including what the moderation pipeline processes.
- Demo account credentials with seeded matches and messages for reviewers, or review will fail.
- IAP only for digital goods; correct product IDs, localized store metadata in EN + AR; subscription terms, price and renewal disclosed on the paywall screen itself.
- Apple additionally requires a moderation/response commitment for user-generated content and a plan for objectionable-content takedown within 24h.
- Google Play requires a Data Deletion URL reachable without login.

## 8. Production authentication and account security

- Email + password with breach-password rejection, plus Google sign-in; optional Apple sign-in required if any other social sign-in is present in the iOS build.
- Verified email required before discovery is unlocked; no anonymous sign-ups.
- Session hardening: short-lived access tokens with rotating refresh, device/session list with remote revoke, forced re-auth for sensitive actions (email change, delete account, billing changes).
- Optional TOTP 2FA for members; **mandatory** 2FA for every staff/admin role.
- Admin console behind role checks already in place, plus IP-allowlist option and separate staff accounts (never a member account with a role bolted on).
- Recovery flows are single-use, short-expiry, and never reveal whether an address exists.

## 9. Rate limiting and anti-abuse controls

Layered, all server-enforced:
- Edge: per-IP request ceilings, bot filtering, ASN reputation on auth and signup endpoints.
- Application: per-account quotas on likes, messages, reports, profile edits, photo uploads, password resets, checkout attempts; sliding-window counters in the database with a shared helper.
- Behavioural: velocity heuristics (mass-liking, copy-paste messaging, rapid re-registration), device fingerprint reuse, disposable-email blocking.
- Content: the existing deterministic safety engine plus a human queue; new-account restrictions (no external links, limited first-message volume) for the first 24–48h.
- Every limit returns a neutral, non-enumerable error and is logged for the moderation queue.

## 10. Email delivery and verification

- Transactional email through a reputable provider on a dedicated sending subdomain (e.g. `mail.lyve.app`) with SPF, DKIM and DMARC (`p=quarantine`, moving to `reject`).
- Separate streams/subdomains for transactional vs any future marketing mail so a campaign complaint cannot break verification email delivery.
- Templates in EN + AR, RTL-correct, brand-consistent: verify email, password reset, new device sign-in, subscription started/renewed/cancelled/refunded, moderation and appeal outcomes.
- Verification links are single-use, 30-minute expiry, with rate-limited resend.
- Bounce/complaint webhooks feed a suppression list; hard-bounced addresses block further sends and flag the account.
- No PII beyond what the message requires; never include profile photos or message content in email.

## 11. Monitoring, logging and alerting

- **Error tracking** on client and server with release tagging and source maps; PII scrubbing in the pipeline.
- **Structured logs** with a request/trace id, actor id, and route; message bodies, tokens and payment identifiers are never logged.
- **Metrics/SLOs**: p95 latency for discovery, match and message send; auth success rate; webhook processing success and lag; realtime delivery lag; error budget per surface.
- **Business alarms**: signup and checkout conversion collapse, refund/chargeback spike, moderation queue backlog, report-to-action time.
- **Alerting** with severity tiers to a single on-call channel; every alert has a linked runbook. Weekly review of the moderation and billing dashboards.
- Audit logs (already implemented) are retained separately from operational logs and are append-only.

## 12. Backup and disaster recovery

- Managed Postgres with automated daily backups plus point-in-time recovery; target **RPO ≤ 15 min, RTO ≤ 4 h** at launch.
- Backups encrypted at rest, access limited to a break-glass role, retention 30 days (plus a longer-retention monthly snapshot if legal requires).
- Storage bucket versioning for profile media, with lifecycle rules matching the retention policy.
- **Restores are rehearsed quarterly** into a scratch environment — an untested backup is not a backup.
- Documented incident runbooks: database loss, provider outage, webhook backlog replay (safe because the ledger is idempotent), storage outage, credential compromise.
- Read-only "safe mode" flag that keeps discovery and messaging alive while writes to billing are paused during an incident.

## 13. Privacy and data retention

- Publish a data map: what is collected, why, lawful basis, retention, and processors.
- Retention defaults: soft-deleted accounts purge after 30 days; messages purge with the conversation; moderation evidence retained 12 months; billing records retained as long as tax law requires (typically 5–10 years) in a minimised form; operational logs 30–90 days.
- Data subject rights: in-app export (machine-readable) and in-app deletion, both self-service, with a documented response window.
- Data residency: check per market — GCC and EU deployments may require a stated primary region; document the region and any cross-border transfer mechanism (SCCs).
- Minimisation stays enforced in code: phone, email, exact address, GPS coordinates and payment data are never exposed in product surfaces.
- Cookie/consent banner only where required, and only for what is actually set.

## 14. Legal and policy readiness

Required before any paid launch, drafted with a qualified lawyer per market:
Terms of Service (with subscription and auto-renewal terms), Privacy Policy, Community Guidelines, Safety Policy, Refund & Cancellation Policy, Cookie Policy, Acceptable Use, and a Law-Enforcement/Takedown contact. Add versioned in-app acceptance with an audit record of which version each user accepted, plus a change-notification flow. Confirm dating-app-specific rules in each launch market (GCC content and marketing rules in particular), age-verification obligations, and consumer auto-renewal disclosure laws (EU, UK, several US states). Register the entity, tax IDs, and a data-protection contact before Wave 2.

## 15. Production secrets and configuration management

- Secrets live only in the managed secret store; never in the repo, never in client bundles, never in logs or error payloads.
- Strict separation of preview and production secrets; production values are not readable by preview builds.
- Distinct secrets per provider and per environment: web provider API key, webhook signing secret, Apple shared secret / App Store server key, Google service account, email provider key.
- Rotation policy: scheduled rotation, plus immediate rotation on staff offboarding or suspected exposure; webhook secrets support dual-key overlap so rotation causes no dropped deliveries.
- Non-secret configuration (plan codes, price book, country config, feature flags) is data in the database with an audited admin editor — changing a price must not require a deploy.
- A startup check fails loudly if a required production secret is missing, rather than silently degrading.

## 16. Final security audit strategy

1. Re-run the full existing regression suite (Phases 1–5, 378+ assertions) against a production-shaped environment.
2. Add a Phase 6 suite: real-provider webhook signature verification, receipt/purchase-token validation forgery attempts, cross-channel entitlement collisions, price/plan tampering at checkout, tax-country spoofing, rate-limit bypass, session fixation and refresh-token replay, email-verification link reuse, admin RBAC under production roles.
3. Automated scans: dependency/CVE scan, database linter, secret scanning in CI, headers and TLS check.
4. Manual review: threat model refresh, RLS diff review, staff-access review, log-leak review (no PII, no tokens).
5. External **third-party penetration test** before public launch — non-negotiable for a dating product handling intimate data.
6. Ship a `SECURITY.md` and a coordinated vulnerability-disclosure contact.

## 17. Deployment architecture

- Edge-served application with server functions; managed Postgres + realtime + private object storage behind it.
- Three environments: preview (per branch), staging (production-shaped, seeded, real store sandbox + provider test mode), production.
- CI pipeline: typecheck → lint → unit tests → full security regression suite → build → deploy. A failing security suite blocks the deploy.
- Database changes ship as forward-only, reviewed migrations; every migration must be safe against the previous app version (expand → migrate → contract).
- Feature flags for every launch-risk surface (payments, new markets, new plans) so exposure is a toggle, not a redeploy.
- Custom domain with HSTS, strict CSP, and security headers; store apps built from the same tagged release as the web deploy.

## 18. Launch checklist and rollback plan

**Go/no-go checklist**
- [ ] Legal documents published, versioned and accepted in-app
- [ ] Payment provider live, tax configuration verified, real end-to-end purchase completed in each launch currency
- [ ] Store apps approved, IAP products live, restore-purchases verified on both platforms
- [ ] Email deliverability verified (SPF/DKIM/DMARC pass, inbox placement checked)
- [ ] Full security regression suite green; external pen-test findings resolved or accepted
- [ ] Backups verified by an actual restore rehearsal
- [ ] Monitoring, alerting and on-call rota active with runbooks linked
- [ ] Moderation team trained, staffed for launch timezone coverage, SLAs agreed
- [ ] Rate limits and anti-abuse thresholds tuned against staging load
- [ ] Support inbox, refund workflow and escalation path staffed

**Rollout:** internal → closed beta (invite, single market) → soft launch Wave 1 with payments behind a flag at 10% → 50% → 100% → Wave 2.

**Rollback:** application rollback is a redeploy of the previous tagged release (minutes). Payments roll back by flag — checkout closes, existing subscriptions keep working, webhooks keep processing into the ledger so nothing is lost. Database rollback is forward-fix plus, only in a true emergency, PITR restore with a documented data-loss window. Store builds cannot be un-shipped, so mobile risk is controlled by server-side flags and phased release percentages, never by hoping a build is fine.

---

## Recommended sequencing for Phase 6 implementation

1. Production hardening that needs no provider: auth hardening, rate limiting, email, monitoring, backups, secrets, config tables.
2. Legal and policy content, versioned acceptance, retention jobs.
3. Web payment provider integration behind a flag, in test mode, in staging.
4. Store billing (iOS/Android) with server-side receipt validation.
5. Final security audit + external pen test.
6. Phased launch.

## Open decisions for you

1. Merchant of record: Paddle (tax handled for you) or Stripe (more control, you own tax)?
2. Launch scope: GCC-only Wave 1, or GCC + EU/UK together?
3. Mobile apps at launch, or web-first with apps in Phase 7?
4. Legal entity and tax registration status — which country, and is it already incorporated?
5. Moderation staffing model at launch (in-house, outsourced, hybrid)?

**Nothing here is built yet.** Say which options you want and approve the phase, and I will implement in the sequence above, stopping for review between steps.
