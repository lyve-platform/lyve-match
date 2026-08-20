import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useI18n } from "@/i18n";
import { fill } from "@/lib/format";
import { COMPATIBILITY_DIMENSIONS, COMPATIBILITY_WEIGHTS } from "@/config/compatibility";
import type { CompatibilityResult } from "@/lib/compatibility";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

/**
 * Renders the compatibility estimate together with its reasons and an optional
 * per-dimension breakdown. The score is always presented as an estimate — never
 * as a promise or a prediction of success.
 */
export function CompatibilityInsight({
  compatibility,
  interestLabel,
}: {
  compatibility: CompatibilityResult | null;
  interestLabel: (slug: string) => string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  if (!compatibility) {
    return <p className="text-xs text-muted-foreground">{t.discover.scoreUnavailable}</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span
          className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary"
          aria-label={fill(t.discover.scoreLabel, { score: compatibility.score })}
        >
          {fill(t.discover.scoreLabel, { score: compatibility.score })}
        </span>
        <span className="text-xs text-muted-foreground">{t.discover.scoreNote}</span>
      </div>

      {compatibility.reasons.length > 0 ? (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t.discover.whyTitle}
          </h4>
          <ul className="mt-1.5 space-y-1">
            {compatibility.reasons.map((reason) => (
              <li key={reason.key} className="text-sm text-foreground/90">
                {fill(t.discover.reasons[reason.key], {
                  values: (reason.values ?? [])
                    .map((value) => (reason.key === "interests" ? interestLabel(value) : value))
                    .join(", "),
                })}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 rounded-full px-2 text-xs"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {t.discover.breakdown}
        <ChevronDown className={open ? "rotate-180 transition" : "transition"} aria-hidden="true" />
      </Button>

      {open ? (
        <ul className="space-y-2">
          {COMPATIBILITY_DIMENSIONS.map((dimension) => {
            const value = compatibility.subscores[dimension];
            return (
              <li key={dimension} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span>
                    {t.discover.dimensions[dimension]}{" "}
                    <span className="text-muted-foreground">
                      ({Math.round(COMPATIBILITY_WEIGHTS[dimension] * 100)}%)
                    </span>
                  </span>
                  <span className="text-muted-foreground">
                    {value === null ? "—" : `${value}%`}
                  </span>
                </div>
                <Progress value={value ?? 0} className="h-1.5" />
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
