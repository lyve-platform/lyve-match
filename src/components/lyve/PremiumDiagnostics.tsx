/**
 * Premium status panel.
 *
 * Shows exactly three truths side by side: what StoreKit reports on this
 * device, what the server says this account is entitled to, and the last
 * StoreKit/link failure. It asserts nothing of its own — the entitlement row
 * is the server's answer, so the panel can never disagree with access.
 */
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCopy, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import {
  formatIapLog,
  lastIapFailure,
  subscribeIapLog,
  type IapLogEntry,
} from "@/lib/native/iap-log";
import type { IapAvailability } from "@/lib/native/iap";
import { nativePlatform, shellMarker } from "@/lib/native/runtime";
import type { BillingSnapshot } from "@/lib/billing-core";

type Props = {
  snapshot: BillingSnapshot;
  availability: IapAvailability;
  productsLoaded: number;
};

function Row({ label, value, ok }: { label: string; value: string; ok: boolean | null }) {
  const Icon = ok === null ? AlertTriangle : ok ? CheckCircle2 : XCircle;
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/60 py-2 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2 text-sm font-medium">
        <Icon
          aria-hidden="true"
          className={`size-4 ${ok === false ? "text-destructive" : ok === null ? "text-muted-foreground" : "text-primary"}`}
        />
        {value}
      </span>
    </div>
  );
}

export function PremiumDiagnostics({ snapshot, availability, productsLoaded }: Props) {
  const { t } = useI18n();
  const copy = t.premiumPage.diagnostics;
  const [log, setLog] = useState<IapLogEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [device, setDevice] = useState("");

  useEffect(() => subscribeIapLog(setLog), []);
  useEffect(() => {
    setDevice(`${nativePlatform()} / ${shellMarker(navigator.userAgent)}`);
  }, []);

  const failure = lastIapFailure(log);
  const storeKitValue = availability.available
    ? copy.storeKitReady
    : availability.reason === "not_native"
      ? copy.storeKitWeb
      : copy.storeKitMissing;

  async function copyLog() {
    try {
      await navigator.clipboard.writeText(formatIapLog(log));
      toast.success(copy.copied);
    } catch {
      toast.error(t.premiumPage.errors.GENERIC);
    }
  }

  return (
    <section aria-labelledby="premium-status-heading" className="surface-panel space-y-2 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 id="premium-status-heading" className="font-display text-lg font-semibold">
          {copy.title}
        </h2>
        <Badge variant={snapshot.isPremium ? "default" : "outline"} className="rounded-full text-xs">
          {snapshot.isPremium ? copy.entitlementActive : copy.entitlementInactive}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">{copy.subtitle}</p>

      <div className="pt-2">
        <Row label={copy.storeKit} value={storeKitValue} ok={availability.available} />
        <Row label={copy.device} value={device || "…"} ok={null} />
        <Row
          label={copy.products}
          value={String(productsLoaded)}
          ok={availability.available ? productsLoaded > 0 : null}
        />
        <Row
          label={copy.entitlement}
          value={snapshot.isPremium ? copy.entitlementActive : copy.entitlementInactive}
          ok={snapshot.isPremium}
        />
        <Row
          label={copy.subscription}
          value={
            snapshot.subscription
              ? (t.premiumPage.status[snapshot.subscription.status] ?? snapshot.subscription.status)
              : copy.noSubscription
          }
          ok={snapshot.subscription ? snapshot.isPremium : null}
        />
        <Row
          label={copy.lastFailure}
          value={failure ? failure.event : copy.noFailure}
          ok={failure ? false : null}
        />
      </div>

      {failure?.detail ? (
        <p className="text-xs text-muted-foreground">{JSON.stringify(failure.detail)}</p>
      ) : null}

      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          variant="outline"
          size="sm"
          className="rounded-full"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? copy.hideLog : copy.showLog}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="rounded-full"
          disabled={log.length === 0}
          onClick={() => void copyLog()}
        >
          <ClipboardCopy aria-hidden="true" /> {copy.copyLog}
        </Button>
      </div>

      {open ? (
        <pre className="max-h-56 overflow-auto rounded-lg bg-muted/50 p-3 text-xs leading-relaxed">
          {log.length ? formatIapLog(log) : copy.emptyLog}
        </pre>
      ) : null}
    </section>
  );
}
