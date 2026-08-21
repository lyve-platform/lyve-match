import { useQuery } from "@tanstack/react-query";
import { Check, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { useI18n } from "@/i18n";
import { useAuth } from "@/auth/AuthProvider";
import { fetchPhoneVerification, phoneVerificationKey } from "@/lib/phone-verification";

/** Explains how a verified phone number is masked and exactly who can see it. */
export function PhoneVisibilityCard() {
  const { t } = useI18n();
  const { user } = useAuth();
  const copy = t.phoneVisibility;

  const { data } = useQuery({
    queryKey: phoneVerificationKey(user?.id ?? "anon"),
    queryFn: fetchPhoneVerification,
    enabled: Boolean(user),
    staleTime: 60_000,
  });

  const masked = data?.hint ?? copy.notVerified;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{copy.subtitle}</p>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 bg-muted/40 p-4">
        <ShieldCheck aria-hidden="true" className="size-5 text-primary" />
        <div className="space-y-0.5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {copy.storedLabel}
          </p>
          <p dir="ltr" className="font-mono text-base font-medium">
            {masked}
          </p>
        </div>
        {data?.verified ? (
          <span className="ms-auto inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Check aria-hidden="true" className="size-3.5" />
            {copy.verifiedTag}
          </span>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">{copy.maskExplainer}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 rounded-lg border border-border/60 p-4">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <Eye aria-hidden="true" className="size-4 text-primary" />
            {copy.canSeeTitle}
          </h3>
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            {copy.canSee.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </div>
        <div className="space-y-2 rounded-lg border border-border/60 p-4">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <EyeOff aria-hidden="true" className="size-4 text-muted-foreground" />
            {copy.cannotSeeTitle}
          </h3>
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            {copy.cannotSee.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{copy.footnote}</p>
    </div>
  );
}
