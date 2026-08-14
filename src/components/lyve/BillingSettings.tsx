/**
 * Billing section for Settings.
 *
 * Read-only by design: plan, status, period and source only. No card data, no
 * provider references and no payment identifiers are ever exposed here —
 * LYVE does not hold them.
 */
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useBilling } from "@/hooks/useBilling";
import { SubscriptionState } from "@/routes/_authenticated/premium";

export function BillingSettings() {
  const { t } = useI18n();
  const { data, isLoading } = useBilling();

  if (isLoading || !data) {
    return <p className="text-sm text-muted-foreground">{t.auth.notices.loading}</p>;
  }

  return (
    <div className="space-y-4">
      <SubscriptionState snapshot={data} />
      <p className="text-xs text-muted-foreground">{t.billingSettings.noPaymentData}</p>
      <Button asChild variant="outline" className="min-h-11 rounded-full">
        <Link to="/premium">{t.billingSettings.viewPremium}</Link>
      </Button>
    </div>
  );
}
