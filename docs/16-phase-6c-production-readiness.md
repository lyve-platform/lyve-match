# Phase 6C — Production Store Readiness (planning + controlled rollout)

Status: **production purchases are NOT enabled.** This document is the checklist, the proof of environment separation, the staged rollout plan, and the Go/No-Go gate. Nothing here activates a production store; that requires explicit approval at the end.

Current deployment posture, asserted by the suite on every run:
`LYVE_STORE_ENVIRONMENT=sandbox`, no Apple production key, no Google production service account, store mode is not `production`.

---

## 1. Apple production checklist

| #   | Item                                                                                                                                                                     | Where it is done                    | Done when                                                                                                | Owner            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------- |
| A1  | App Store Connect account in good standing, Paid Apps agreement active, banking + tax complete                                                                           | App Store Connect                   | Agreement shows Active; without it products stay in "Missing Metadata"                                   | Business         |
| A2  | Bundle ID matches the shipped app exactly                                                                                                                                | Apple Developer + app build         | `APPLE_IAP_BUNDLE_ID` equals the build's bundle id; a mismatch is rejected by the verifier (test C5)     | Mobile           |
| A3  | Subscription group created (one group = one upgrade/downgrade ladder)                                                                                                    | App Store Connect                   | Monthly and annual live in the SAME group so members can switch, not double-subscribe                    | Product          |
| A4  | Product IDs registered and frozen                                                                                                                                        | App Store Connect                   | IDs equal `STORE_PRODUCTS` in `src/lib/billing/store-core.ts` exactly; unknown ids are refused (test C6) | Eng + Product    |
| A5  | Pricing set per tier, with base territory chosen deliberately                                                                                                            | App Store Connect                   | Price matrix reviewed; no accidental "free trial forever" offer                                          | Business         |
| A6  | Availability by country matches our launch markets, and excludes any market we cannot legally serve                                                                      | App Store Connect                   | Country list signed off; App Store availability equals in-app market list                                | Business + Legal |
| A7  | Introductory / promotional offers configured (or deliberately none)                                                                                                      | App Store Connect                   | Every offer maps to a plan the entitlement layer already knows                                           | Product          |
| A8  | Production App Store Server API key issued (Issuer ID, Key ID, .p8), least-privilege                                                                                     | App Store Connect → Keys            | Stored as secrets; never in chat, code, logs, or CI                                                      | Eng              |
| A9  | App Store Server Notifications **V2** production URL set to `https://<prod-domain>/api/public/webhooks/apple`                                                            | App Store Connect → App Information | Apple test notification returns 200                                                                      | Eng              |
| A10 | Sandbox notification URL left pointing at the preview deployment                                                                                                         | App Store Connect                   | Sandbox and production URLs are different hosts                                                          | Eng              |
| A11 | Root trust: Apple Root CA - G3 pinned; no override accepted in production                                                                                                | Code (already enforced)             | Test A5/A8/C20 pass                                                                                      | Eng              |
| A12 | Review requirements: subscription terms, price, period and auto-renew disclosed on the paywall; restore-purchases action present; privacy policy + terms links reachable | App + `/premium` screen             | Screenshot review against App Store Review Guideline 3.1.2                                               | Product + Design |
| A13 | Account deletion path visible in-app (Guideline 5.1.1(v)) and does not silently cancel the store subscription                                                            | App                                 | Deletion copy states the subscription must be managed in the App Store                                   | Product          |
| A14 | Sandbox tester accounts created for the release build                                                                                                                    | App Store Connect → Users           | At least one tester per market tier                                                                      | QA               |

## 2. Google production checklist

| #   | Item                                                                                                                                       | Where it is done               | Done when                                                                                                         | Owner         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------------- |
| G1  | Play Console developer account verified, merchant account linked, tax/payment profile complete                                             | Play Console                   | Monetisation setup shows no blockers                                                                              | Business      |
| G2  | Package name matches the shipped app                                                                                                       | Play Console                   | `GOOGLE_PLAY_PACKAGE_NAME` equals the release package; reads are scoped to it (test C19)                          | Mobile        |
| G3  | Subscription product IDs registered                                                                                                        | Play Console → Subscriptions   | IDs equal `STORE_PRODUCTS` exactly                                                                                | Eng + Product |
| G4  | Base plans defined (monthly auto-renewing, annual auto-renewing)                                                                           | Play Console                   | Each base plan is active and backed by a known plan code                                                          | Product       |
| G5  | Offers configured (or deliberately none); no offer grants an entitlement we do not model                                                   | Play Console                   | Offer list reviewed against `entitlementsForPlan`                                                                 | Product       |
| G6  | Country availability + regional pricing set, matching Apple's market list                                                                  | Play Console                   | Divergence between stores is intentional and written down                                                         | Business      |
| G7  | Production service account created, granted only "View financial data" + "Manage orders and subscriptions" for this app                    | Google Cloud + Play Console    | JSON key stored as a secret; access reviewed                                                                      | Eng           |
| G8  | Play Developer API enabled for the project and linked to Play Console                                                                      | Google Cloud                   | `androidpublisher` API enabled                                                                                    | Eng           |
| G9  | Production RTDN topic created; Play Console "Real-time developer notifications" points to it                                               | Play Console + Pub/Sub         | Topic name recorded; Play "Send test notification" succeeds                                                       | Eng           |
| G10 | Pub/Sub **push** subscription to `https://<prod-domain>/api/public/webhooks/google` with OIDC auth, using a dedicated push service account | Pub/Sub                        | `GOOGLE_RTDN_AUDIENCE` and `GOOGLE_RTDN_SERVICE_ACCOUNT_EMAIL` set; unauthenticated pushes rejected (tests B4–B6) | Eng           |
| G11 | Separate sandbox topic/subscription for the preview deployment                                                                             | Pub/Sub                        | Sandbox push never reaches production                                                                             | Eng           |
| G12 | Licence testers added for internal testing (test purchases are free and marked `testPurchase`)                                             | Play Console → Licence testing | Test purchases are refused by production (test C14)                                                               | QA            |
| G13 | Play Console data safety, subscription cancellation copy and restore path complete                                                         | Play Console + app             | Policy review passed                                                                                              | Product       |

## 3. Environment separation — proven, not asserted

The deployment declares exactly one environment. Credentials for the other environment are treated as a misconfiguration and the store is disabled — there is no fallback path anywhere.

| Property                                                  | Enforcement                                                              | Test             |
| --------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------- |
| Sandbox credentials cannot operate production             | Separate variable names; `hasMisplaced*Credentials()` disables the store | A9–A12, A26–A27  |
| Production credentials cannot operate sandbox             | Same check, mirrored                                                     | A13–A14          |
| A production deployment has no HMAC test rail             | `appleRail()`/`googleRail()` return `hmac` only in sandbox               | A15–A19          |
| A sandbox-signed receipt cannot buy production Premium    | Rail check precedes any signature check                                  | A18–A19          |
| A sandbox transaction cannot be redeemed in production    | Environment on the store response must equal the deployment              | C4, C14          |
| A production transaction cannot be redeemed in sandbox    | Same equality check, both directions                                     | Phase 6B D17     |
| No attacker-choosable trust anchor in production          | Root override honoured only in sandbox                                   | A5, A8, C20      |
| Partial, malformed or unparseable credentials fail closed | `NOT_CONFIGURED` / `INVALID_CREDENTIAL`, never "trust the client"        | A20–A22, A28–A29 |
| Wrong app / wrong package                                 | Bundle id and package scoping                                            | C5, C19          |

Secrets are entered only through the secure secret store. They are never requested or shown in chat, never committed, never logged, and CI fails if a production store credential is present (`.github/workflows/security-suite.yml`).

### Production variable names (values entered securely, never here)

Apple: `APPLE_IAP_ISSUER_ID`, `APPLE_IAP_KEY_ID`, `APPLE_IAP_PRIVATE_KEY`, `APPLE_IAP_BUNDLE_ID`
Google: `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, `GOOGLE_PLAY_PACKAGE_NAME`, `GOOGLE_RTDN_AUDIENCE`, `GOOGLE_RTDN_SERVICE_ACCOUNT_EMAIL`
Deployment switch: `LYVE_STORE_ENVIRONMENT=production` (the last thing turned on, never the first)
Operations: `STORE_RECONCILE_SECRET`

---

## 4. Staged rollout

Purchases are never opened to everyone at once. Each stage has an entry gate, an exit gate, and a rollback that takes effect immediately.

**Stage 0 — Preview / sandbox (current).** Sandbox credentials only. Exit: a real sandbox purchase, renewal, cancellation, refund and reconciliation each observed end to end; suite green.

**Stage 1 — Internal testing.** Production build, production credentials, purchases restricted to internal testers (App Store Connect internal testers / Play internal testing track). Entry: sections 1–3 complete, Go/No-Go signed. Exit: ≥5 real purchases across both stores, one refund and one cancellation observed, zero critical alerts for 72h.

**Stage 2 — Closed testing.** TestFlight external group / Play closed track, ~100 members, one or two markets. Exit: 7 days, reconciliation drift zero, no ownership or duplicate anomalies, support playbook exercised at least once.

**Stage 3 — Limited production.** Public release with purchases gated to a fraction of members and to launch markets only. The paywall is server-gated: members outside the cohort see Premium as "coming soon" and no purchase can be initiated. Ramp 5% → 25% → 50%, at least 48h at each step, ratcheting down on any critical alert. Exit: 14 days, refund rate and involuntary-churn within expectations, no unresolved billing support tickets.

**Stage 4 — Full production.** Purchases open in all approved markets. Reconciliation continues hourly; alerting continues paging.

**Rollback at any stage:** set the purchase gate to closed (existing subscribers keep access, no new purchases), or unset production credentials to disable the store entirely. Neither action revokes anyone's entitlements, and neither loses a notification: the ledger keeps every event and reconciliation replays what was missed.

---

## 5. Security requirements

The full suite is a **mandatory CI gate** — pull request, push to main, and pre-deploy. It may not be skipped or soft-failed, and production billing may not be enabled on a red run.

Baseline before this phase: 743/743.
Added in Phase 6C: `tests/security/phase6c-production.ts`, **97 assertions**.
Total now: **840/840 passing.**

Phase 6C coverage:

| Requirement                                     | Assertions           |
| ----------------------------------------------- | -------------------- |
| Production credential isolation                 | A1–A29               |
| Production webhook authentication               | B1–B6                |
| Production receipt verification (Apple)         | C1–C12, C20          |
| Production purchase-token verification (Google) | C13–C19              |
| Subscription renewal                            | D4–D6                |
| Cancellation                                    | D10–D11              |
| Expiration                                      | D12–D13              |
| Refund                                          | D15–D17              |
| Revocation                                      | C7, C9, C15, D15–D16 |
| Reconciliation                                  | E1–E6                |
| Account ownership                               | D1–D2, D6, D18       |
| Cross-account transfer attempts                 | D3, D17              |
| Duplicate events                                | D7, E5               |
| Out-of-order events                             | D8–D9                |
| Rate limiting                                   | F1–F3                |
| Monitoring                                      | F7–F10               |
| Secret redaction                                | F4–F6                |
| Launch posture (production still off)           | G1–G5                |

---

## 6. Go / No-Go checklist — STOP for explicit approval

Every line must be **Yes** before `LYVE_STORE_ENVIRONMENT=production` is set. Any No is a No-Go.

**Store configuration**

1. Apple: bundle id, subscription group, product ids, pricing, country availability, offers — all final and matching the code catalogue.
2. Apple: production App Store Server API key issued and stored securely; ASSN V2 production URL set and test notification returns 200.
3. Google: package name, product ids, base plans, offers, country availability — all final and matching the code catalogue.
4. Google: production service account issued with least privilege and stored securely; production RTDN topic + authenticated push subscription verified with a test notification.
5. Sandbox and production notification endpoints point at different deployments.

**Platform** 6. Suite green in CI on the exact commit being released (840/840), and CI contains no production store credential. 7. `LYVE_STORE_ENVIRONMENT` set on exactly one deployment; the other environment's credentials are absent (the app refuses to operate otherwise). 8. `STORE_RECONCILE_SECRET` set and the hourly reconciliation schedule live and observed to run. 9. Alert transport connected to a real on-call destination; a synthetic critical alert has paged someone. 10. Purchase gate for Stage 3 implemented and defaulting to closed.

**Product, legal, support** 11. Paywall discloses price, period, auto-renew and cancellation; restore purchases works on both platforms. 12. Terms, privacy and subscription terms published and linked from the paywall. 13. Support playbook written for: refund requested, purchase not reflected, wrong account, duplicate charge, subscription expired unexpectedly. 14. Account deletion copy explains store-side subscription management.

**Decision** 15. Named approver, date, and the commit SHA being enabled — recorded here at approval time.

Awaiting explicit approval before enabling production billing.
