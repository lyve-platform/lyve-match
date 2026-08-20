import Capacitor
import Foundation
import StoreKit

/// StoreKit 2 bridge for LYVE.
///
/// The plugin never grants entitlements. It returns App Store localized prices
/// for display and, on purchase, the signed transaction (JWS) which the server
/// verifies against the App Store Server API before linking it to an account.
@available(iOS 15.0, *)
@objc(LyveIAP)
public class LyveIAP: CAPPlugin {

  /// Localized display prices, straight from the App Store. No price is hard-coded in the app.
  @objc func products(_ call: CAPPluginCall) {
    let ids = call.getArray("productIds", String.self) ?? []
    Task {
      do {
        let storeProducts = try await Product.products(for: Set(ids))
        let payload: [[String: Any]] = storeProducts.map { product in
          [
            "productId": product.id,
            "displayPrice": product.displayPrice,
            "currencyCode": product.priceFormatStyle.currencyCode,
            "title": product.displayName,
          ]
        }
        call.resolve(["products": payload])
      } catch {
        call.reject(error.localizedDescription)
      }
    }
  }

  @objc func purchase(_ call: CAPPluginCall) {
    guard let productId = call.getString("productId") else {
      return call.reject("productId required")
    }
    Task {
      do {
        guard let product = try await Product.products(for: [productId]).first else {
          return call.reject("unknown product")
        }
        switch try await product.purchase() {
        case .success(let verification):
          // Pass the signed payload through untouched; the server verifies it.
          if case .verified(let transaction) = verification {
            await transaction.finish()
          }
          call.resolve(["jws": verification.jwsRepresentation])
        case .userCancelled:
          call.resolve(["cancelled": true])
        case .pending:
          call.resolve(["pending": true])
        @unknown default:
          call.reject("purchase failed")
        }
      } catch {
        call.reject(error.localizedDescription)
      }
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
