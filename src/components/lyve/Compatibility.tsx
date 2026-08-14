import { Check, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n";
import { Section } from "./Section";
import { CompatibilityRing } from "./CompatibilityRing";

export function Compatibility() {
  const { t } = useI18n();

  return (
    <Section id="compatibility" title={t.compatibility.title} subtitle={t.compatibility.subtitle}>
      <div className="surface-panel mx-auto grid max-w-4xl items-center gap-8 p-6 md:grid-cols-[auto_1fr] md:p-10">
        <div className="grid place-items-center gap-3">
          <CompatibilityRing value={87} label={t.compatibility.scoreLabel} size={200} />
          <Badge variant="outline" className="rounded-full">
            {t.compatibility.exampleBadge}
          </Badge>
        </div>

        <div>
          <h3 className="text-lg font-semibold">{t.compatibility.reasonsTitle}</h3>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {t.compatibility.reasons.map((reason) => (
              <li
                key={reason}
                className="flex items-start gap-2 rounded-xl bg-muted px-4 py-3 text-sm"
              >
                <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
          <p className="mt-5 flex items-start gap-2 text-sm text-muted-foreground">
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>{t.compatibility.disclaimer}</span>
          </p>
        </div>
      </div>
    </Section>
  );
}
