# LYVE — System, API, and Technology Architecture

## 1. Recommended technology
| Layer | Choice | Why |
|---|---|---|
| Frontend | TanStack Start (React 19, Vite 7), Tailwind v4 tokens | SSR + typed routing, mobile-first, RTL-friendly |
| State/data | TanStack Query | cache, loaders, optimistic UI |
| Backend | Server functions (`createServerFn`) + `/api/public/*` routes for webhooks | co-located, typed RPC; no separate service to operate at MVP |
| Database | PostgreSQL via Lovable Cloud (Postgres + Auth + Storage + Realtime) | RLS, realtime chat, managed auth, file storage |
| Realtime | Postgres realtime channels for messages, typing, presence | no extra infra |
| AI | Lovable AI Gateway (server-side only) | bio help, conversation starters, moderation triage |
| Payments | Provider-agnostic abstraction; Stripe as first adapter (**not yet configured**) | web subscriptions; store-billing adapters later |
| Verification | Pluggable IDV adapter (**no provider configured yet**) | avoid vendor lock, no false claims |
| Media | Managed object storage with signed URLs | no public buckets for private photos |

Nothing above is "connected" today — this document is the proposal.

## 2. Module boundaries
```text
src/
  modules/
    auth/         signup, login, otp, age-gate, session
    onboarding/   step machine, draft persistence
    profile/      profile, photos, video, interests, lifestyle
    discovery/    candidate feed, filters, actions
    matching/     compatibility engine, reasons, weights
    chat/         conversations, messages, realtime, safety hooks
    safety/       report, block, mute, appeals, moderation intake
    verification/ levels, IDV adapter
    billing/      plans, subscriptions, boosts, super likes, provider adapters
    notifications/ dispatch, preferences, channels
    admin/        dashboard, moderation, payments, analytics, audit
    shared/       ui kit, i18n, hooks, validation schemas, errors
```
Rules: UI never talks to the DB directly; every mutation goes through a server function
with Zod validation and authorization; `*.server.ts` holds privileged logic.

## 3. API module proposal (server functions unless noted)
```
auth:         requestOtp, verifyOtp, signOut, confirmAge, refreshSession
profile:      getMyProfile, updateProfile, uploadPhoto, reorderPhotos, deletePhoto,
              setIntents, setInterests, getPublicProfile(userId)
discovery:    getCandidates(cursor), likeUser, passUser, superLikeUser, saveProfile
matching:     getCompatibility(userId), listMatches, unmatch
chat:         listConversations, getMessages(cursor), sendMessage, markRead,
              setTyping (realtime), deleteMessage, deleteConversation
safety:       reportUser, reportMessage, blockUser, unblockUser, muteUser, submitAppeal
verification: startVerification, getVerificationStatus
billing:      listPlans, startCheckout, cancelSubscription, purchaseBoost,
              purchaseSuperLikes, getEntitlements
notifications:list, markRead, updatePreferences, registerDevice
admin:        adminMetrics, adminSearchUsers, adminUserDetail, adminUserAction,
              adminListReports, adminDecideCase, adminListPayments, adminRefund,
              adminGetWeights, adminSetWeights, adminListPlans, adminUpsertPlan,
              adminListAuditLogs

HTTP routes (public, signature-verified):
  POST /api/public/webhooks/payments
  POST /api/public/webhooks/verification
  POST /api/public/cron/expire-boosts
  GET  /api/public/health
```

## 4. Request lifecycle
Client → server function → auth middleware (session + status check) → Zod validation →
rate limiter → authorization (ownership / RBAC) → domain service → Postgres (RLS) →
audit log (if sensitive) → typed response.

## 5. Environments
`local → preview → production`. Secrets only in environment variables. Separate
database and storage per environment. No production data in preview.

## 6. Testing strategy
- Unit: compatibility scoring, age calculation, entitlement resolution, validators.
- Integration: server functions against a test database, RLS policy tests
  (user A must never read user B's private rows).
- E2E (Playwright): signup → onboarding → discover → match → chat → report → upgrade.
- Security tests: authz matrix per role, rate-limit behavior, upload rejection cases.
- Seed data is clearly synthetic and only for non-production environments.

## 7. Deployment
Lovable-hosted preview and production. Migrations are versioned and forward-only,
reviewed before apply. Rollback via new corrective migration. Monitoring: error
reporting, server-function logs, payment webhook failure alerts, moderation queue depth.
