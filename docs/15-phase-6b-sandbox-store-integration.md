# Phase 6B — Sandbox Store Integration Validation

Status: implemented, sandbox rail only. No production Apple or Google credentials are connected, and none can be used: a production deployment refuses to start on sandbox keys and vice versa.

## 1. What was added

| Area | Module |
| --- | --- |
| DER / X.509 chain reader | `src/lib/billing/x509.server.ts` |
| JWS + JWT primitives (Apple ES256 chain, Apple client assertion, Google service JWT, Google OIDC) | `src/lib/billing/jws.server.ts` |
| Credential + environment resolution | `src/lib/billing/store-env.server.ts` |
| App Store Server API client | `src/lib/billing/apple-store.server.ts` |
| Google Play Developer API + Pub/Sub push auth | `src/lib/billing/google-store.server.ts` |
| Reconciliation engine | `src/lib/billing/store-reconcile.server.ts` |
| Rate limiting + alerting | `src/lib/billing/store-ops.server.ts` |
| Scheduled reconciliation endpoint | `src/routes/api/public/cron/store-reconcile.ts` |
| Staff health read / manual pass | `src/lib/store-ops.functions.ts` |

## 2. Verification rails

`storeMode()` and the per-store rail resolve at call time:

- `api` — store credentials configured. Apple payloads are verified as ES256 JWS with the full `x5c` chain anchored to Apple Root CA - G3 (pinned by SHA-256 fingerprint); Google pushes are authenticated by their Pub/Sub OIDC bearer token and then **re-read** from the Play Developer API, which is the authority.
- `hmac` — no store credentials: the internal sandbox test rail from Phase 6A, sandbox-only.
- `none` — misconfiguration (credentials for the wrong environment, malformed key). Every request is refused.

A "receipt" from the app is only a pointer (originalTransactionId / purchaseToken) once credentials exist; plan, period, status and environment always come from the store.

## 3. Reconciliation

Store notifications are best-effort, so a scheduled pass re-reads state for purchases already in `store_purchases`:

- Work set comes from our own database — a caller cannot steer it.
- Event ids are derived from store state (`recon:<store>:<hash>`), so re-running is a no-op.
- Refunded / revoked purchases are skipped: a stale read can never restore access.
- Application goes through `billing_apply_store_event`, which still refuses out-of-order events.
- Every pass is recorded in `store_reconciliation_runs` (append-only).

Schedule: `POST /api/public/cron/store-reconcile` hourly with `Authorization: Bearer $STORE_RECONCILE_SECRET`. Without the secret the endpoint is disabled, not open.

## 4. Rate limiting and alerting

Database-backed fixed windows (`store_rate_limit_hit`) shared across instances; a limiter outage denies traffic on the public webhook surface rather than allowing it.

| Surface | Limit |
| --- | --- |
| Store webhook (per caller) | 120 / 60s |
| Webhook signature failures | 20 / 300s |
| Member purchase linking | 10 / 600s |
| Reconciliation | 4 / hour |

Alerts group into `store_alerts` by kind + fingerprint + window with thresholds (signature failures 5/5min critical, processing failure 1 critical, drift 1 warning). Details are whitelisted and truncated: receipts, purchase tokens and authorization headers can never reach monitoring; purchase references appear only as a 16-hex digest.

## 5. Test evidence

`tests/security/phase6b-integration.ts` — 118 assertions, run in `bun run test:security`.

Coverage: certificate-chain forgery (rogue root, spliced leaf, missing intermediate, expired certs), `alg=none` and HS256 substitution, payload tampering, environment and bundle mismatch, unknown products, every HTTP failure code mapping to refusal, Pub/Sub OIDC audience/principal/issuer/expiry/signature checks, Play state mapping, reconciliation idempotency and revocation safety, monitoring redaction, limiter behaviour, and RLS/EXECUTE lockdown of the new operational tables and routines.

Total regression suite: **743/743 passing**.

## 6. Remaining before production

1. Apple sandbox credentials (`APPLE_IAP_SANDBOX_ISSUER_ID`, `_KEY_ID`, `_PRIVATE_KEY`, `_BUNDLE_ID` = `app.lyve.ios.test`) and Google sandbox credentials (`GOOGLE_PLAY_SANDBOX_SERVICE_ACCOUNT_JSON`, `_PACKAGE_NAME`, `GOOGLE_RTDN_SANDBOX_AUDIENCE`, `_SERVICE_ACCOUNT_EMAIL`) — these are store-issued and must be supplied before a live sandbox purchase can be exercised end to end.
2. `STORE_RECONCILE_SECRET` plus the hourly scheduler.
3. Alert transport (paging/email) attached to breached alerts; the durable record already exists.
4. Production credentials and `LYVE_STORE_ENVIRONMENT=production` — explicitly out of scope until approved.
