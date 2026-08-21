import { BadgeCheck } from "lucide-react";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * The Verified mark.
 *
 * Shown for any member whose selfie was reviewed against their profile photos
 * — women and men alike. It is never inferred client-side: the flag arrives
 * from a server-side projection of `profiles.verification_status`.
 */
export function VerifiedBadge({
  verified,
  className,
  withLabel = false,
}: {
  verified: boolean;
  className?: string | undefined;
  withLabel?: boolean;
}) {
  const { t } = useI18n();
  if (!verified) return null;

  return (
    <span
      title={t.verification.badgeTitle}
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary",
        className,
      )}
    >
      <BadgeCheck aria-hidden="true" className="size-3.5" />
      <span className={withLabel ? "" : "sr-only"}>{t.verification.badge}</span>
    </span>
  );
}
