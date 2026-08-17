# LYVE — iOS App Shell (Phase 6D, sandbox only)

Status: scaffold. No production store credentials are enabled. Apple production
billing stays blocked until an explicit Go/No-Go per `docs/16-phase-6c-production-readiness.md`.

## Approach

The iOS app is a thin Capacitor shell around the existing LYVE web app plus a
native StoreKit 2 plugin. Rationale:

- Apple requires digital subscriptions to be sold through IAP in a native app.
- All matching, messaging, RBAC, RLS and entitlement logic already lives
  server-side; duplicating it in Swift would create a second security surface.
- The shell adds exactly one native capability: purchase + restore.

The client never grants entitlements. StoreKit returns a signed transaction
(JWS); the shell posts it to `linkStorePurchase`, which verifies it with the
App Store Server API and links it to the authenticated account.

## Repository pieces

| File | Role |
| --- | --- |
| `capacitor.config.ts` | App id `app.lyve.ios`, name `LYVE Match`, hosted web URL |
| `src/lib/native/runtime.ts` | Safe native/platform detection (web behaviour unchanged) |
| `src/lib/native/iap.ts` | `LyveIAP` plugin bridge: `purchaseProduct`, `restoreReceipts`, `purchaseAndLink` |
| `src/lib/billing/store-core.ts` | Product catalogue: `app.lyve.ios.premium.monthly` / `.annual` |

Web builds are untouched: `iapAvailable()` is `false` in the browser, so the
existing premium UI keeps its current behaviour.

## Local native setup (run on a Mac with Xcode)

```bash
bun run build
bunx cap add ios
bunx cap sync ios
bunx cap open ios
```

## Native StoreKit plugin (add in Xcode, `ios/App/App/LyveIAP.swift`)

```swift
import Capacitor
import StoreKit

@objc(LyveIAP)
public class LyveIAP: CAPPlugin {
  @objc func purchase(_ call: CAPPluginCall) {
    guard let productId = call.getString("productId") else { return call.reject("productId required") }
    Task {
      do {
        guard let product = try await Product.products(for: [productId]).first else {
          return call.reject("unknown product")
        }
        switch try await product.purchase() {
        case .success(let verification):
          // Pass the signed payload through untouched; the server verifies it.
          call.resolve(["jws": verification.jwsRepresentation])
        case .userCancelled:
          call.resolve(["cancelled": true])
        default:
          call.reject("purchase failed")
        }
      } catch { call.reject(error.localizedDescription) }
    }
  }

  @objc func restore(_ call: CAPPluginCall) {
    Task {
      var payloads: [String] = []
      for await result in Transaction.currentEntitlements {
        payloads.append(result.jwsRepresentation)
      }
      call.resolve(["jws": payloads])
    }
  }
}
```

Register it with a matching `LyveIAP.m` `CAP_PLUGIN` macro exporting
`purchase:` and `restore:`.

## Sandbox test plan

1. App Store Connect: subscription group + both products in "Ready to Submit".
2. Create a Sandbox tester; sign in on-device under Settings → Developer.
3. Buy monthly in the shell → server verifies against the sandbox App Store
   Server API (credentials already stored) → `store_purchases` row `linked`.
4. Restore purchases on a second device with the same Apple ID → no duplicate
   grant, purchase stays bound to the original LYVE account.
5. Cancel/refund in sandbox → App Store Server Notification V2 revokes the
   entitlement.

## Still required before production

- Production Apple secrets (issuer id, key id, .p8) — not requested yet.
- Production App Store Server Notifications V2 URL in App Store Connect.
- Paid Apps agreement, tax and banking complete.
- Explicit Go/No-Go approval to flip the store environment to `production`.
