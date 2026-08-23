package app.lyve.android;

import androidx.annotation.NonNull;

import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Google Play Billing bridge.
 *
 * Mirrors the iOS `LyveIAP` contract: the plugin only runs the Play purchase
 * flow and hands back the opaque purchase token. It NEVER grants entitlements —
 * the token is posted to the LYVE server, which verifies it against the Play
 * Developer API before anything is unlocked.
 */
@CapacitorPlugin(name = "LyveBilling")
public class LyveBilling extends Plugin implements PurchasesUpdatedListener {

    private BillingClient billingClient;
    private final Map<String, ProductDetails> details = new HashMap<>();
    private PluginCall pendingPurchase;

    @Override
    public void load() {
        billingClient = BillingClient
            .newBuilder(getContext())
            .setListener(this)
            .enablePendingPurchases()
            .build();
    }

    private interface Ready {
        void run(PluginCall call);
    }

    /** Connects lazily; every entry point goes through here. */
    private void withConnection(PluginCall call, Ready block) {
        if (billingClient == null) {
            call.reject("billing_unavailable");
            return;
        }
        if (billingClient.isReady()) {
            block.run(call);
            return;
        }
        billingClient.startConnection(
            new BillingClientStateListener() {
                @Override
                public void onBillingSetupFinished(@NonNull BillingResult result) {
                    if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                        block.run(call);
                    } else {
                        call.reject("billing_setup_failed:" + result.getResponseCode());
                    }
                }

                @Override
                public void onBillingServiceDisconnected() {
                    // Next call reconnects.
                }
            }
        );
    }

    private static String formattedPrice(ProductDetails product) {
        List<ProductDetails.SubscriptionOfferDetails> offers = product.getSubscriptionOfferDetails();
        if (offers == null || offers.isEmpty()) return null;
        List<ProductDetails.PricingPhase> phases = offers
            .get(0)
            .getPricingPhases()
            .getPricingPhaseList();
        if (phases.isEmpty()) return null;
        return phases.get(0).getFormattedPrice();
    }

    private static String currencyCode(ProductDetails product) {
        List<ProductDetails.SubscriptionOfferDetails> offers = product.getSubscriptionOfferDetails();
        if (offers == null || offers.isEmpty()) return null;
        List<ProductDetails.PricingPhase> phases = offers
            .get(0)
            .getPricingPhases()
            .getPricingPhaseList();
        if (phases.isEmpty()) return null;
        return phases.get(0).getPriceCurrencyCode();
    }

    private static String offerToken(ProductDetails product) {
        List<ProductDetails.SubscriptionOfferDetails> offers = product.getSubscriptionOfferDetails();
        if (offers == null || offers.isEmpty()) return null;
        return offers.get(0).getOfferToken();
    }

    /** Localized Play prices for the requested subscription product ids. */
    @PluginMethod
    public void products(PluginCall call) {
        JSArray requested = call.getArray("productIds");
        final List<String> ids = new ArrayList<>();
        try {
            JSONArray raw = requested == null ? new JSONArray() : requested;
            for (int i = 0; i < raw.length(); i++) ids.add(raw.getString(i));
        } catch (Exception error) {
            call.reject("malformed_product_ids");
            return;
        }
        if (ids.isEmpty()) {
            call.reject("no_product_ids");
            return;
        }

        withConnection(
            call,
            (ready) -> {
                List<QueryProductDetailsParams.Product> products = new ArrayList<>();
                for (String id : ids) {
                    products.add(
                        QueryProductDetailsParams.Product
                            .newBuilder()
                            .setProductId(id)
                            .setProductType(BillingClient.ProductType.SUBS)
                            .build()
                    );
                }
                billingClient.queryProductDetailsAsync(
                    QueryProductDetailsParams.newBuilder().setProductList(products).build(),
                    (result, list) -> {
                        if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                            ready.reject("query_failed:" + result.getResponseCode());
                            return;
                        }
                        JSArray out = new JSArray();
                        List<String> found = new ArrayList<>();
                        for (ProductDetails product : list) {
                            String price = formattedPrice(product);
                            if (price == null) continue;
                            details.put(product.getProductId(), product);
                            found.add(product.getProductId());
                            JSObject item = new JSObject();
                            item.put("productId", product.getProductId());
                            item.put("displayPrice", price);
                            item.put("currencyCode", currencyCode(product));
                            item.put("title", product.getName());
                            out.put(item);
                        }
                        JSArray missing = new JSArray();
                        for (String id : ids) if (!found.contains(id)) missing.put(id);

                        JSObject response = new JSObject();
                        response.put("products", out);
                        response.put("storefront", "play");
                        response.put("missing", missing);
                        ready.resolve(response);
                    }
                );
            }
        );
    }

    /** Runs the Play purchase sheet and returns the purchase token. */
    @PluginMethod
    public void purchase(PluginCall call) {
        final String productId = call.getString("productId");
        if (productId == null || productId.isEmpty()) {
            call.reject("missing_product_id");
            return;
        }
        withConnection(
            call,
            (ready) -> {
                ProductDetails cached = details.get(productId);
                if (cached == null) {
                    ready.reject("product_not_loaded");
                    return;
                }
                String token = offerToken(cached);
                if (token == null) {
                    ready.reject("no_offer");
                    return;
                }
                BillingFlowParams params = BillingFlowParams
                    .newBuilder()
                    .setProductDetailsParamsList(
                        List.of(
                            BillingFlowParams.ProductDetailsParams
                                .newBuilder()
                                .setProductDetails(cached)
                                .setOfferToken(token)
                                .build()
                        )
                    )
                    .build();

                pendingPurchase = ready;
                ready.setKeepAlive(true);
                BillingResult launch = billingClient.launchBillingFlow(getActivity(), params);
                if (launch.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    pendingPurchase = null;
                    ready.setKeepAlive(false);
                    ready.reject("launch_failed:" + launch.getResponseCode());
                }
            }
        );
    }

    @Override
    public void onPurchasesUpdated(@NonNull BillingResult result, List<Purchase> purchases) {
        PluginCall call = pendingPurchase;
        pendingPurchase = null;
        if (call == null) return;

        int code = result.getResponseCode();
        JSObject response = new JSObject();
        if (code == BillingClient.BillingResponseCode.USER_CANCELED) {
            call.setKeepAlive(false);
            response.put("cancelled", true);
            call.resolve(response);
            return;
        }
        if (code != BillingClient.BillingResponseCode.OK) {
            call.setKeepAlive(false);
            call.reject("purchase_failed:" + code);
            return;
        }

        if (resolvePurchaseResult(call, purchases)) return;

        // Play can report OK while omitting the purchase list (notably when an
        // already-owned subscription is selected). Query current ownership
        // instead of converting a successful response into purchase_failed:0.
        billingClient.queryPurchasesAsync(
            QueryPurchasesParams
                .newBuilder()
                .setProductType(BillingClient.ProductType.SUBS)
                .build(),
            (queryResult, ownedPurchases) -> {
                if (queryResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    call.setKeepAlive(false);
                    call.reject("purchase_recovery_failed:" + queryResult.getResponseCode());
                    return;
                }
                if (resolvePurchaseResult(call, ownedPurchases)) return;
                call.setKeepAlive(false);
                call.reject("purchase_no_token");
            }
        );
    }

    private boolean resolvePurchaseResult(PluginCall call, List<Purchase> purchases) {
        if (purchases == null) return false;
        for (Purchase purchase : purchases) {
            JSObject response = new JSObject();
            if (purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
                call.setKeepAlive(false);
                response.put("jws", purchase.getPurchaseToken());
                call.resolve(response);
                return true;
            }
            if (purchase.getPurchaseState() == Purchase.PurchaseState.PENDING) {
                call.setKeepAlive(false);
                response.put("pending", true);
                call.resolve(response);
                return true;
            }
        }
        return false;
    }

    /** Replays purchase tokens Play already knows about for this Google account. */
    @PluginMethod
    public void restore(PluginCall call) {
        withConnection(
            call,
            (ready) ->
                billingClient.queryPurchasesAsync(
                    QueryPurchasesParams
                        .newBuilder()
                        .setProductType(BillingClient.ProductType.SUBS)
                        .build(),
                    (result, purchases) -> {
                        if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                            ready.reject("restore_failed:" + result.getResponseCode());
                            return;
                        }
                        JSArray tokens = new JSArray();
                        if (purchases != null) {
                            for (Purchase purchase : purchases) {
                                if (purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
                                    tokens.put(purchase.getPurchaseToken());
                                }
                            }
                        }
                        JSObject response = new JSObject();
                        response.put("jws", tokens);
                        ready.resolve(response);
                    }
                )
        );
    }

    /**
     * Acknowledges a purchase AFTER the server verified and linked it.
     * Play auto-refunds purchases that stay unacknowledged for three days.
     */
    @PluginMethod
    public void acknowledge(PluginCall call) {
        final String token = call.getString("purchaseToken");
        if (token == null || token.isEmpty()) {
            call.reject("missing_purchase_token");
            return;
        }
        withConnection(
            call,
            (ready) ->
                billingClient.acknowledgePurchase(
                    AcknowledgePurchaseParams.newBuilder().setPurchaseToken(token).build(),
                    (result) -> {
                        JSObject response = new JSObject();
                        response.put(
                            "acknowledged",
                            result.getResponseCode() == BillingClient.BillingResponseCode.OK ||
                            result.getResponseCode() == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED
                        );
                        ready.resolve(response);
                    }
                )
        );
    }
}
