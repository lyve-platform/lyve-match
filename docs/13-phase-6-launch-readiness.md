# Phase 6 — Launch Readiness & Production Payments: Architecture Proposal

**Launch shape (corrected):** LYVE is **mobile-first**. Initial production platforms are **iOS and Android only**. **Web is deferred** to a later phase — no web checkout, and neither Paddle nor Stripe is the initial production billing provider. The only initial Premium purchase sources are **Apple In-App Purchase** and **Google Play Billing**, both verified server-side.

Status: **proposal only**. No production database change, no payment provider connection, no store submission, and no production Apple/Google credentials. Nothing here is implemented until you approve it.

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

## 2. Mobile billing architecture (iOS + Android at launch, Web deferred)

Two live purchase channels at launch, one entitlement truth, with a third slot reserved.

```text
      iOS IAP                 Android Billing          [ Web checkout — DEFERRED ]
    (App Store)                (Google Play)            (Paddle/Stripe, later phase)
         |                           |                              :
  App Store Server         Real-time Developer                   signed
   Notifications V2          Notifications                       webhook
   + server-side              + server-side                         :
   receipt/txn check        purchase-token check                    :
         \___________________________|______________________________:
                                     v
                        billing_apply_subscription   (single authoritative write)
                                     v
                              entitlements   <- the only thing any feature reads
```

Rules:
- The Phase 5 provider abstraction gains `apple` and `google` adapters now; `stripe`/`paddle` remain unimplemented slots in the same registry. No feature gate ever learns which channel paid — adding web later is a new adapter, not a change to the authorization model.
- **The client never grants Premium.** The app sends only an opaque receipt/purchase token; entitlement is written exclusively by the server after validation.
- Apple: validate with the App Store Server API (JWS transaction/renewal info, signed-payload chain verified against Apple root certs), keyed by `originalTransactionId`. Google: validate with `purchases.subscriptionsv2.get` via a service account, keyed by the purchase token / linked purchase token chain, and acknowledge within the required window.
- Store server notifications (ASSN V2, Google RTDN via Pub/Sub push) are the source of lifecycle truth: renew, grace period, billing retry, expire, refund, revoke. Each notification is verified, deduplicated in the existing immutable `billing_events` ledger, and applied idempotently.
- One account may hold at most one active subscription; a second channel purchase for an already-Premium account is recorded and surfaced as "managed on <channel>" rather than double-billing. The UI deep-links to the correct store cancellation surface.
- Restore purchases is server-side: the app asks the server to re-validate the store account's entitlements; local receipt state is never authoritative.
- Anti-steering: no external checkout link, no price steering inside the launch app binary.

**Future web phase (no rework required):** add a `stripe`/`paddle` adapter + signed webhook route that calls the same `billing_apply_subscription`. Entitlement reads, feature gates, admin tooling and tests stay untouched.

## 3. Payment provider options and tradeoffs

| Option | Strengths | Tradeoffs | Fit for LYVE |
| --- | --- | --- | --- |
| **Apple IAP** (launch) | Mandatory in-app; frictionless conversion; Apple handles tax, invoicing and refunds | 15–30% commission, minimal customer data, refunds decided by Apple | Required launch channel for iOS |
| **Google Play Billing** (launch) | Same as above for Android; strong lifecycle notifications | 15–30% commission, refunds decided by Google | Required launch channel for Android |
| Stripe (deferred) | Best-in-class subscription API, SCA/3DS, dispute tooling | You are merchant of record: you own VAT/sales-tax registration | Revisit when web launches |
| Paddle (deferred) | Merchant of record — owns global VAT/GST, invoicing, chargebacks | Less flexible primitives, higher effective rate, stricter dating review | Revisit when web launches |
| Regional (Tap, Checkout.com, Network Intl.) | Local GCC methods, better in-region auth rates | Extra integration, no global subscription model | Only relevant to a future web rail |

**Decision:** Apple + Google only for the initial production launch. The merchant-of-record question (Paddle vs Stripe) is explicitly **not decided now** and does not block launch, because Phase 5's abstraction makes it a later, additive choice.


## 4. Subscription plans and entitlement strategy

Keep the plan set small and honest.

- **Free** — discovery, limited daily likes, matches, messaging with matches, all safety features. Safety is never paywalled.
- **Premium** — who liked you, compatibility insights, advanced preferences, rewind, unlimited/raised likes, read receipts control.
- **Premium+ (Phase 7 candidate)** — priority visibility, weekly boosts, travel/global discovery. Do **not** ship at launch; prove Premium first.
- **Consumables** (boosts, super-likes) — deferred; they add refund and store-accounting complexity.

Billing periods: monthly, 3-month, 12-month, published as App Store / Play subscription groups with the discount shown as a real per-month figure. Intro offers only where store rules and local consumer law allow. Entitlements remain the single read surface — plan changes are a mapping table (`plan_code → entitlement keys`, with `store_product_id → plan_code` resolved server-side), never new `if` statements in feature code. When web arrives later, it maps its own product IDs into the same `plan_code` table.

## 5. Currency and localization architecture

**Launch language policy: English-only.** The initial production launch ships `en` as the sole selectable locale. The i18n architecture, the full Arabic dictionaries (`ar*.ts`), the `dir`/RTL handling and all RTL-safe logical CSS utilities (`ms-*`, `me-*`, `ps-*`, `pe-*`, `start/end`) remain in the codebase untouched. Arabic is disabled at the selector level only: `ENABLED_LOCALES` in `src/i18n/index.tsx` contains `["en"]`, `setLocale` ignores disabled locales, a stored or browser-preferred `ar` never activates, and `LanguageSwitcher` renders nothing while a single locale is enabled. This guarantees no partially-translated Arabic UI can surface. Activating Arabic later requires only: (1) add `"ar"` to `ENABLED_LOCALES`, (2) complete and review the Arabic dictionaries, (3) confirm RTL direction switching, (4) run RTL accessibility and visual QA. No component rewrites.

- **Store price tiers, not FX math.** Each plan has explicit, human-approved App Store / Play price points per storefront. Never multiply a USD price by a live FX rate at runtime.
- Launch currencies: AED, SAR, USD, EUR, GBP via store storefronts; everything else falls back to the store's own USD tier.
- Currency and storefront come from the user's store account and are fixed by the store for the life of the subscription.
- Display: prices shown in-app come from the store's localized product metadata (`StoreKit` / Play Billing), formatted with `Intl.NumberFormat`. Store listings at launch are English; RTL layout support stays in the codebase for the future Arabic activation.
- Tax and invoicing are handled entirely by Apple and Google at launch; LYVE never hand-rolls an invoice. (Tax ownership only becomes ours if a future web rail uses Stripe.)
- All billing UI strings go through the localization system (`en.billing.ts` at launch, `ar.billing.ts` kept in sync-ready state); no hard-coded strings outside i18n, and no untranslated store text is shown to the user.

## 6. Refund, cancellation and chargeback handling

- **Cancellation** never revokes access immediately: the subscription enters `cancel_at_period_end`, entitlement expires at period end, and the UI states the exact end date. At launch, cancellation is store-managed — deep-link to the App Store / Play subscription screen; LYVE reacts to the resulting notification.
- **Refunds** are decided by Apple and Google at launch; we react to `REFUND` / `REVOKE` notifications by revoking entitlement through the existing ledger path, and we publish a policy explaining that store purchases follow store refund rules. Statutory cooling-off rights are satisfied by the stores' own processes.
- **Grace period and billing retry** states keep entitlement alive exactly as long as the store says, then expire; the UI prompts a store-side payment-method fix rather than an in-app charge.
- **Chargebacks / revocations** trigger automatic entitlement revocation plus an account flag; evidence (consent timestamp, terms version accepted, usage log) is assembled from existing audit data. Repeat-revocation accounts are blocked from re-entitlement.

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
- Google Play requires a Data Deletion URL reachable without login (served from the marketing/legal site even though the product web app is deferred).
- Store review is now on the critical path: both apps must be approved before any launch date is committed, and every server-side change must stay backward-compatible with the oldest approved binary.

## 8. Production authentication and mobile account security

- Email + password with breach-password rejection, plus Google sign-in and **Sign in with Apple** (mandatory on iOS once any other social sign-in exists).
- Verified email required before discovery is unlocked; no anonymous sign-ups.
- Mobile session hardening: short-lived access tokens with rotating refresh, refresh tokens stored only in the platform secure store (iOS Keychain / Android Keystore-backed EncryptedSharedPreferences) — never in plain app storage or logs; device/session list with remote revoke.
- Forced re-auth (and biometric prompt where available) for sensitive actions: email change, delete account, subscription management.
- App-level hardening: certificate pinning on API calls, jailbreak/root signal recorded as a risk factor, no sensitive data in screenshots/app-switcher snapshots, deep links validated server-side (universal links / App Links only, no custom-scheme trust).
- Optional TOTP 2FA for members; **mandatory** 2FA for every staff/admin role.
- Admin console behind role checks already in place, plus IP-allowlist option and separate staff accounts (never a member account with a role bolted on). Admin remains web-only and is not part of the store builds.
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

1. Maintain and re-run the existing security baseline — **488/488 assertions must stay green** (Phases 1–5) — against a production-shaped environment. No Phase 6 change may reduce that count.
2. Add a Phase 6 suite: Apple JWS/App Store notification signature verification, Google RTDN + purchase-token validation, forged and replayed receipt attempts, expired/sandbox receipt rejection in production, cross-channel entitlement collisions, product-ID→plan tampering, entitlement grant attempted from the client, rate-limit bypass, session fixation and refresh-token replay, secure-store token handling, email-verification link reuse, admin RBAC under production roles.
3. Automated scans: dependency/CVE scan, database linter, secret scanning in CI, headers and TLS check, mobile binary scan (secrets in bundle, pinning present).
4. Manual review: threat model refresh, RLS diff review, staff-access review, log-leak review (no PII, no tokens, no receipts).
5. External **third-party penetration test** (API + both mobile binaries) before public launch — non-negotiable for a dating product handling intimate data.
6. Ship a `SECURITY.md` and a coordinated vulnerability-disclosure contact.

## 17. Deployment architecture

- Edge-served API and server functions; managed Postgres + realtime + private object storage behind it. The web surface at launch is API + marketing/legal + admin only — no consumer web app.
- Three environments: preview (per branch), staging (production-shaped, seeded, **App Store Sandbox + Play license testers**), production.
- CI pipeline: typecheck → lint → unit tests → full security regression suite (488+) → build → deploy. A failing security suite blocks the deploy.
- Database changes ship as forward-only, reviewed migrations, always safe against the **oldest approved store binary** (expand → migrate → contract). Mobile clients cannot be force-updated instantly, so the API stays backward-compatible for at least two releases.
- Feature flags for every launch-risk surface (billing channel, new markets, new plans) so exposure is a toggle, not a store resubmission. Add a minimum-supported-version gate for forced upgrades.
- Custom domain with HSTS, strict CSP and security headers for the API/admin/legal surfaces; store apps built from the same tagged release as the backend deploy.

## 18. Launch checklist and rollback plan

**Go/no-go checklist**
- [ ] Legal documents published, versioned and accepted in-app
- [ ] Apple + Google IAP products live, server-side validation verified end-to-end in sandbox and production, real purchase completed on both platforms
- [ ] Restore-purchases and cross-device entitlement verified on both platforms
- [ ] App Store Server Notifications V2 and Google RTDN endpoints receiving, verifying and applying events idempotently
- [ ] Store apps approved with 18+ rating, EN + AR metadata, demo reviewer account seeded
- [ ] Email deliverability verified (SPF/DKIM/DMARC pass, inbox placement checked)
- [ ] Security regression suite green at 488/488 plus the Phase 6 additions; external pen-test findings resolved or accepted
- [ ] Backups verified by an actual restore rehearsal
- [ ] Monitoring, alerting and on-call rota active with runbooks linked
- [ ] Moderation team trained, staffed for launch timezone coverage, SLAs agreed
- [ ] Rate limits and anti-abuse thresholds tuned against staging load
- [ ] Support inbox, refund-enquiry workflow and escalation path staffed

**Rollout:** internal → TestFlight / Play internal testing → closed beta (invite, single market) → staged store rollout with billing behind a server flag at 10% → 50% → 100% → Wave 2 markets.

**Rollback:** backend rollback is a redeploy of the previous tagged release (minutes). Billing rolls back by server flag — the paywall closes, existing subscriptions keep working, store notifications keep processing into the idempotent ledger so nothing is lost. Database rollback is forward-fix plus, only in emergency, PITR with a documented data-loss window. Store builds cannot be un-shipped: mobile risk is controlled by server-side flags, staged rollout percentages and Play's halt-rollout control — never by hoping a build is fine.

---

## Recommended sequencing for Phase 6 implementation

1. **Provider-independent production hardening** (current step): auth and mobile session hardening, rate limiting and anti-abuse, monitoring/logging/alerting, backups and disaster recovery, email security and verification, account protection, secrets and config tables — plus the mobile billing *architecture* (adapter interfaces, product→plan mapping, notification route skeletons) with **no production Apple/Google credentials connected**.
2. Legal and policy content, versioned acceptance, retention jobs.
3. Apple IAP + Google Play Billing integration with server-side validation, in sandbox/test only, behind a flag.
4. Store submission preparation and review.
5. Final security audit + external pen test.
6. Phased store launch.
7. **Deferred:** web checkout via Paddle or Stripe as an additional adapter, no change to the entitlement model.

**Stop point:** implementation stops at the end of step 1 and waits for explicit approval before any production billing integration.

## Open decisions for you

1. Launch scope: GCC-only Wave 1, or GCC + EU/UK together?
2. Mobile client approach for the store builds (native vs cross-platform wrapper around the existing product surface)?
3. Legal entity and tax registration status — which country, and is it already incorporated?
4. Moderation staffing model at launch (in-house, outsourced, hybrid)?
5. Timing for the deferred web phase — immediately post-launch, or after Premium is proven on mobile?

(The merchant-of-record question is intentionally deferred with the web channel.)

**Nothing here is built yet.** Approve the hardening step and I will implement item 1 above, keeping the security baseline at 488/488, and stop for review before any billing integration.

