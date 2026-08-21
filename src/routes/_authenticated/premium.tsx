/**
 * LYVE Premium.
 *
 * This page never asserts that a payment happened. It renders exactly what the
 * server reports: whether a provider is connected at all, whether it is a test
 * provider, and the member's real subscription state from the database.
 * Prices come from configuration and are `null` until announced — the UI says
 * so rather than inventing a number.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, Crown, Loader2, Minus } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { AccountShell } from "@/components/lyve/AccountShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useBilling, useBillingActions } from "@/hooks/useBilling";
import { BILLING_PLANS, FEATURE_MATRIX, priceFor } from "@/config/billing";
import {
  fetchProducts,
  iapAvailable,
  productIdForPlan,
  purchaseAndLink,
  type IapProduct,
} from "@/lib/native/iap";
import { linkStorePurchase } from "@/lib/billing-store.functions";
import type { BillingSnapshot } from "@/lib/billing-core";


const title = "LYVE Premium — plans and subscription";
const description =
  "Compare the free and Premium LYVE experience, and review your current subscription state.";

export const Route = createFileRoute("/_authenticated/premium")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PremiumPage,
});

function formatPrice(
  amountMinor: number | null,
  currency: string,
  locale: string,
  fallback: string,
): string {
  if (amountMinor === null) return fallback;
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amountMinor / 100);
}

function PremiumPage() {
  const { t, locale } = useI18n();
  const { data, isLoading } = useBilling();
  const actions = useBillingActions();
  const link = useServerFn(linkStorePurchase);
  const copy = t.premiumPage;

  // StoreKit purchases only exist inside the iOS shell; the web build is untouched.
  const [storeReady, setStoreReady] = useState(false);
  const [storePrices, setStorePrices] = useState<Record<string, IapProduct>>({});
  const [buying, setBuying] = useState<string | null>(null);

  useEffect(() => {
    if (!iapAvailable()) return;
    setStoreReady(true);
    const ids = BILLING_PLANS.map((plan) => productIdForPlan(plan.code)).filter(
      (id): id is NonNullable<ReturnType<typeof productIdForPlan>> => id !== undefined,
    );
    void fetchProducts(ids).then((products) => {
      setStorePrices(Object.fromEntries(products.map((product) => [product.productId, product])));
    });
  }, []);

  if (isLoading || !data) {
    return (
      <AccountShell title={copy.title} subtitle={copy.subtitle}>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 aria-hidden="true" className="size-4 animate-spin" /> {t.auth.notices.loading}
        </p>
      </AccountShell>
    );
  }

  /** In-app purchase: StoreKit charges, the server verifies, LYVE never grants locally. */
  async function subscribeInApp(planCode: string) {
    const productId = productIdForPlan(planCode);
    if (!productId) return;
    setBuying(planCode);
    try {
      const { outcome, result } = await purchaseAndLink(productId, link);
      if (outcome.kind === "cancelled") return;
      if (outcome.kind !== "receipt" || !result) {
        toast.error(copy.errors.GENERIC);
        return;
      }
      if (result === "LINKED" || result === "ALREADY_OWNED") {
        toast.success(copy.actions.restored);
        await actions.restore.mutateAsync();
        return;
      }
      toast.error(copy.storeErrors[result] ?? copy.errors.GENERIC);
    } catch {
      toast.error(copy.errors.GENERIC);
    } finally {
      setBuying(null);
    }
  }

  async function subscribe(planCode: string) {
    if (storeReady) {
      await subscribeInApp(planCode);
      return;
    }
    const result = await actions.checkout.mutateAsync(planCode);
    const created = result.code === "CHECKOUT_CREATED" || result.code === "TEST_CHECKOUT_CREATED";
    if (!created) {
      toast.error(copy.errors[result.code as keyof typeof copy.errors] ?? copy.errors.GENERIC);
      return;
    }
    if (result.url) window.location.assign(result.url);
    else toast.success(copy.checkoutOpened);
  }


  async function run(action: "cancel" | "resume" | "manage" | "restore") {
    try {
      if (action === "restore") {
        await actions.restore.mutateAsync();
        toast.success(copy.actions.restored);
        return;
      }
      const result = await actions[action].mutateAsync();
      if (result.code !== "OK") {
        toast.error(copy.errors[result.code as keyof typeof copy.errors] ?? copy.errors.GENERIC);
        return;
      }
      if (action === "manage" && result.url) window.location.assign(result.url);
    } catch {
      toast.error(copy.errors.GENERIC);
    }
  }

  return (
    <AccountShell title={copy.title} subtitle={copy.subtitle} wide>
      <ProviderNotice snapshot={data} storeReady={storeReady} />

      <SubscriptionState snapshot={data} />

      <section aria-labelledby="plans-heading" className="space-y-4">
        <h2 id="plans-heading" className="font-display text-xl font-semibold">
          {copy.heading}
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {BILLING_PLANS.map((plan) => {
            const price = priceFor(plan, data.currency);
            const productId = productIdForPlan(plan.code);
            const storePrice = productId ? storePrices[productId] : undefined;
            const pending = buying === plan.code || (!storeReady && actions.checkout.isPending);
            const storeOnly = data.provider === "apple" && !storeReady;
            return (
              <article key={plan.code} className="surface-panel space-y-3 p-6">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-display text-lg font-semibold">
                    {plan.interval === "month" ? copy.monthly : copy.annual}
                  </h3>
                  {data.checkoutOffered && !data.checkoutIsLive ? (
                    <Badge variant="outline" className="rounded-full text-xs">
                      {copy.testOnlyBadge}
                    </Badge>
                  ) : null}
                </div>
                <p className="text-2xl font-semibold">
                  {storePrice
                    ? storePrice.displayPrice
                    : formatPrice(
                        price?.amountMinor ?? null,
                        price?.currency ?? data.currency,
                        locale,
                        storeOnly ? copy.priceInStore : copy.priceUnavailable,
                      )}
                </p>
                <p className="text-sm text-muted-foreground">
                  {plan.interval === "month" ? copy.perMonth : copy.perYear}
                </p>
                <Button
                  className="min-h-11 w-full rounded-full"
                  disabled={storeOnly || (!storeReady && !data.checkoutOffered) || pending}
                  onClick={() => void subscribe(plan.code)}
                >
                  {pending ? (
                    <Loader2 aria-hidden="true" className="animate-spin" />
                  ) : (
                    <Crown aria-hidden="true" />
                  )}
                  {storeOnly ? copy.actions.iosOnly : copy.actions.subscribe}
                </Button>

              </article>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">{copy.gracePolicy}</p>
      </section>

      <section aria-labelledby="compare-heading" className="surface-panel overflow-hidden">
        <h2 id="compare-heading" className="px-5 pt-5 font-display text-lg font-semibold">
          {copy.compareTitle}
        </h2>
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="border-y border-border bg-muted/40 text-start">
              <th scope="col" className="px-5 py-3 text-start font-medium">
                {copy.compareTitle}
              </th>
              <th scope="col" className="px-3 py-3 font-medium">
                {copy.columnFree}
              </th>
              <th scope="col" className="px-3 py-3 font-medium">
                {copy.columnPremium}
              </th>
            </tr>
          </thead>
          <tbody>
            {FEATURE_MATRIX.map((feature) => (
              <tr key={feature.id} className="border-b border-border/60 last:border-0">
                <th scope="row" className="px-5 py-3 text-start font-normal">
                  {copy.features[feature.id as keyof typeof copy.features]}
                </th>
                <Cell on={feature.free} yes={copy.included} no={copy.notIncluded} />
                <Cell on={feature.premium} yes={copy.included} no={copy.notIncluded} />
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          className="min-h-11 rounded-full"
          onClick={() => void run("restore")}
        >
          {copy.actions.restore}
        </Button>
        {data.portalSupported ? (
          <Button
            variant="outline"
            className="min-h-11 rounded-full"
            onClick={() => void run("manage")}
          >
            {copy.actions.manage}
          </Button>
        ) : null}
        {data.subscription && !data.subscription.cancelAtPeriodEnd ? (
          <Button
            variant="outline"
            className="min-h-11 rounded-full"
            onClick={() => void run("cancel")}
          >
            {copy.actions.cancel}
          </Button>
        ) : null}
        {data.subscription?.cancelAtPeriodEnd ? (
          <Button
            variant="outline"
            className="min-h-11 rounded-full"
            onClick={() => void run("resume")}
          >
            {copy.actions.resume}
          </Button>
        ) : null}
      </div>
    </AccountShell>
  );
}

function Cell({ on, yes, no }: { on: boolean; yes: string; no: string }) {
  return (
    <td className="px-3 py-3 text-center">
      {on ? (
        <Check aria-label={yes} className="mx-auto size-4 text-primary" />
      ) : (
        <Minus aria-label={no} className="mx-auto size-4 text-muted-foreground" />
      )}
    </td>
  );
}

function ProviderNotice({
  snapshot,
  storeReady,
}: {
  snapshot: BillingSnapshot;
  storeReady: boolean;
}) {
  const { t } = useI18n();
  const copy = t.premiumPage;

  // Apple billing exists only inside the iOS shell; on the web we say so plainly.
  if (snapshot.provider === "apple" && !storeReady) {
    return (
      <div role="note" className="rounded-2xl border border-primary/40 bg-primary/5 p-5">
        <p className="font-semibold">{copy.iosOnlyTitle}</p>
        <p className="mt-1 text-sm text-muted-foreground">{copy.iosOnlyBody}</p>
      </div>
    );
  }

  if (!snapshot.checkoutOffered) {
    return (
      <div role="note" className="rounded-2xl border border-border bg-muted/40 p-5">
        <p className="font-semibold">{copy.notConnectedTitle}</p>
        <p className="mt-1 text-sm text-muted-foreground">{copy.notConnectedBody}</p>
      </div>
    );
  }
  if (!snapshot.checkoutIsLive) {
    return (
      <div role="note" className="rounded-2xl border border-primary/40 bg-primary/5 p-5">
        <p className="font-semibold">{copy.testModeTitle}</p>
        <p className="mt-1 text-sm text-muted-foreground">{copy.testModeBody}</p>
      </div>
    );
  }
  return null;
}

export function SubscriptionState({ snapshot }: { snapshot: BillingSnapshot }) {
  const { t, locale } = useI18n();
  const copy = t.premiumPage;
  const subscription = snapshot.subscription;

  const date = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat("en", { dateStyle: "long" }).format(
          new Date(value),
        )
      : "—";

  if (!subscription) {
    return (
      <section className="surface-panel p-5">
        <h2 className="text-base font-semibold">{copy.statusTitle}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{copy.statusNone}</p>
      </section>
    );
  }

  return (
    <section className="surface-panel space-y-2 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">{copy.statusTitle}</h2>
        <Badge variant={snapshot.isPremium ? "default" : "secondary"} className="rounded-full">
          {copy.status[subscription.status]}
        </Badge>
      </div>
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{copy.statusPlan}</dt>
          <dd>{subscription.planCode}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{copy.statusSource}</dt>
          <dd>{copy.source[subscription.source]}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">
            {subscription.cancelAtPeriodEnd ? copy.statusEnds : copy.statusRenews}
          </dt>
          <dd>{date(subscription.currentPeriodEnd)}</dd>
        </div>
      </dl>
      {subscription.cancelAtPeriodEnd ? (
        <p className="text-sm text-muted-foreground">{copy.cancelNotice}</p>
      ) : null}
    </section>
  );
}
