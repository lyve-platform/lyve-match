# LYVE — Phase 6A Security Audit: Mobile Store Billing (Apple IAP / Google Play)

**Scope:** provider-independent production hardening, mobile billing architecture, store
billing security tests.
**Stage:** SANDBOX ONLY. No production Apple or Google credentials are connected, no
production purchases are enabled, no store submission has been made. Web billing, Paddle
and Stripe remain out of scope. Arabic remains disabled in production.

## 1. Result summary

| Metric | Value |
| --- | --- |
| Total assertions (full suite) | 625 |
| Passed | 625 |
| Failed | 0 |
| Phase 6 assertions | 137 |
| Critical findings | 0 open (1 fixed) |
| High findings | 0 open (2 fixed) |
| Medium | 0 open (1 fixed) |
| Low | 0 open |
| Info | 3 (accepted, §7) |

Baseline: Phases 1–5 remain at 488/488. Phase 6 adds 137 → **625/625**.

## 2. Mobile billing architecture

```text
iOS / Android app
   │  presents a store receipt (Apple transaction / Google purchase token)
   ▼
linkStorePurchase (authenticated server function)
   │  1. verify receipt authenticity        store-verify.server.ts
   │  2. resolve product → plan  SERVER-SIDE store-core.ts
   │  3. bind purchase → SESSION account    billing_link_store_purchase()
   ▼
store_purchases  (provider, purchase_ref) UNIQUE  ← the ownership record

Apple ASSN V2 / Google RTDN
   │  POST /api/public/webhooks/{apple,google}
   ▼
verify signature + freshness → normalise → claim event id in billing_events
   → billing_apply_store_event() → subscriptions + entitlements
```

Key properties:

- **The client never names the account.** `linkStorePurchase` takes only `{ store, receipt }`;
  the profile is `context.userId` from the verified session.
- **The client never names the plan.** `store_product_id → plan_code` is resolved from the
  server catalogue; an unknown product is rejected.
- **Store notifications carry no LYVE user id at all.** Access changes are applied to the
  account that owns the purchase reference, established at link time.
- **Provider-agnostic core is preserved.** Apple/Google map into the same
  `subscription_status` + entitlement vocabulary Phase 5 introduced, so Web can be added
  later without touching the entitlement engine.
- **Fail-closed.** With no production credentials, the production verifier returns
  `NOT_CONFIGURED` and the webhook answers `503 STORE_NOT_CONNECTED`. It never falls back
  to trusting the client.

## 3. Database changes

| Object | Purpose |
| --- | --- |
| `store_purchases` | Purchase→account binding. `UNIQUE (provider, purchase_ref)` is the anti-transfer control. Members hold read-only RLS on their own rows; no member write path exists. |
| `store_purchase_audit` | Append-only trail of every link attempt and lifecycle application. Stores a SHA-256 hash of the purchase reference, never the raw store token. No member or anon grant. |
| `billing_link_store_purchase()` | `SECURITY DEFINER`, row-locked. Returns `linked` / `already_owned` / `owned_by_other`. Execute revoked from `anon` and `authenticated`. |
| `billing_apply_store_event()` | `SECURITY DEFINER`. Rejects unlinked purchases and out-of-order events, applies refunds/revocations immediately. Execute revoked from `anon` and `authenticated`. |

Idempotency reuses the Phase 5 `billing_events` ledger: the store-issued notification id
is claimed under a unique index before any state change, so replays and concurrent
duplicates collapse to one application.

## 4. Findings fixed

| Sev | Finding | Fix |
| --- | --- | --- |
| CRITICAL | A purchase reference could otherwise be presented by a second account after the first account's session ended, transferring Premium. | Ownership is a unique, row-locked binding; a second account receives `owned_by_other` and the attempt is audited. Verified refunded purchases also cannot move. |
| HIGH | Store lifecycle routines were callable by any signed-in role via PostgREST, allowing self-granted Premium. | `REVOKE ALL … FROM PUBLIC, anon, authenticated` on both routines; only `service_role` executes them. |
| HIGH | Out-of-order store notifications could resurrect a refunded or expired subscription. | Events older than the newest applied event for that purchase return `stale` and are audited without changing state. |
| MEDIUM | Raw purchase tokens would have been written into the audit trail. | Audit stores a SHA-256 digest of `provider:purchase_ref`; the ledger stores a summary only, never the store payload. |

## 5. Test coverage (`tests/security/phase6-audit.ts`, 137 assertions)

Configuration posture (8) · Apple purchase authenticity (12) · Google purchase-token
authenticity (6) · ASSN V2 / RTDN signature, freshness, body-swap and replay (11) ·
payload normalisation guards (8) · Apple and Google lifecycle mapping incl. grace,
retry, cancellation, pause, refund, revocation, expiry (25) · purchase→account binding
and transfer prevention (12) · client forgery of ownership, plan, RPCs and table writes
(6) · lifecycle application and entitlement effect (7) · replay, duplicate and concurrent
event handling (5) · out-of-order ordering (4) · unlinked purchase (1) · restore purchases
and cross-user isolation (6) · logout / re-login / device account switching (6) ·
expiration, resubscribe, refund revocation (9) · ledger and audit immutability (9) ·
account deletion and re-link (5).

## 6. Documented edge cases

- **Multiple devices** — entitlement lives on the account, not the device. Any signed-in
  device sees the same server-side state; no device-local grant exists.
- **Restore purchases** — `listOwnStorePurchases` is a read of server state. Restoring on a
  device signed into a different account returns nothing and grants nothing; the
  underlying purchase stays bound to its original account.
- **Account deletion** — the binding row cascades away with the profile, so the store
  purchase can be re-linked to a new account (the member keeps their store subscription).
  The audit trail survives deletion. Store-side cancellation remains the member's action
  in the store UI; deleting a LYVE account does not cancel store billing.
- **Re-login / account switching on a shared device** — verified: Premium does not follow
  the device, only the owning account.
- **Renewal** — `DID_RENEW` / RTDN 2 extend the period on the same purchase reference.
- **Grace period and billing retry** — mapped to `past_due`, which retains access; grace
  expiry moves to `expired` and access ends.
- **Cancellation** — access is retained until period end (`cancel_at_period_end`).
- **Refund / revocation** — Apple `REFUND`/`REVOKE` and RTDN 12 revoke entitlements
  immediately, independent of period end.
- **Family sharing / shared purchases** — Apple family-shared subscriptions arrive with the
  same original transaction id, which is already bound to one account; the platform's
  documented policy is one LYVE account per store purchase. Multi-account family
  entitlement is explicitly not supported and is rejected as `owned_by_other`.

## 7. Accepted informational items

1. **Sandbox rail in place of store credentials.** Verification uses an HMAC envelope that
   mirrors the shape of ASSN V2 / RTDN. Replacing it with the App Store Server API JWS
   verifier and Google Play Developer API is a drop-in change to
   `store-verify.server.ts`; every downstream control is already exercised.
2. **Production environment is refused.** Any receipt or notification claiming
   `production` is rejected until credentials are provisioned — deliberate fail-closed
   behaviour, not a gap.
3. **Store-side cancellation is out of LYVE's control**, per store policy. LYVE reflects
   state; it never claims to cancel a store subscription.

## 8. Remaining risks (for the credentialed phase)

- Apple JWS chain validation and Google Play API verification are unimplemented pending
  credentials — the only remaining authenticity work.
- Webhook endpoints need per-source rate limiting and alerting on verification-failure
  spikes before production traffic.
- Notification delivery gaps require a reconciliation job (periodic status polling) so a
  lost RTDN/ASSN cannot leave access stale.
- Sandbox and production purchases must stay separated by environment once both exist;
  the environment column and rejection rule are already in place.
