# Phase 5 — Billing, Subscriptions & Premium Entitlements: Security Audit

Stage: **architecture**. No payment provider is connected, no production credentials exist, no real price is configured, and no card data is ever received or stored by LYVE.

## Security model

1. **The database is the only authority on access.** Premium comes from rows in `entitlements`, written exclusively by `billing_apply_subscription` / `admin_grant_entitlement`. Members have no insert, update or delete path to `entitlements`, `subscriptions` or `billing_accounts`.
2. **Webhooks are the only provider write path.** Every delivery must carry a fresh timestamp and a valid HMAC-SHA256 signature over `${timestamp}.${rawBody}`, verified with a timing-safe compare against a server-only secret. Verification fails closed when no secret is configured.
3. **Idempotency is enforced in Postgres**, not in application memory: `billing_events.provider_event_id` is unique, the ledger is append-only, and rows cannot be updated or deleted (verified even with the service role).
4. **Backend gates, not UI gates.** `who_liked_me`, `compatibility_insights`, `advanced_preferences` and `rewind` are enforced in server functions before data is projected; free clients receive counts and locked indicators only.
5. **Admin grants are bounded and audited.** Only a role holding the billing-grant permission may grant, a reason is mandatory, duration is bounded to 1–365 days, the actor is taken from the verified session, and both grant and revoke write immutable audit entries.

## Regression suite

`tests/security/phase5-audit.ts` — **110 assertions, all passing**, covering:

- entitlement authority and free/paid separation
- client forgery attempts against entitlements, subscriptions and billing accounts
- cross-user and anonymous read isolation across all four billing tables
- ledger immutability, duplicate rejection, and a five-way concurrent replay race
- signature absence, wrong secret, tampered body, stale timestamp, missing secret, malformed and unknown payloads
- the live webhook route refusing unsigned deliveries and leaking no payload detail
- lifecycle mapping for every event type, including trial, cancellation grace, expiry, refund and chargeback revocation
- database-side lifecycle effects, including loss of Premium capability while suspended
- member and anonymous callers blocked from the provider RPCs
- admin grant RBAC, bounds, reason requirement, actor integrity and audit trail
- billing overview projections withholding provider references from limited roles
- Premium feature gates and rewind ownership
- configuration hygiene: no hard-coded secrets, no `process.env` in browser code, no invented prices

Run everything with `bun run tests/security/run-all.ts` (Phases 1–5).

## Findings

- **Resolved during audit:** none outstanding; all assertions pass against the live database.
- **Noted (product gate, not a privacy boundary):** a free member can see that a `likes` row targets them, but the row exposes only an opaque id — no profile, photo, or contact detail. The Premium "who liked me" surface is assembled server-side and remains gated.
- **Not applicable at this stage:** live provider signature formats, tax/invoice handling, and store receipt validation are deferred until a provider is actually connected.
