import { Crown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n";
import { Section } from "./Section";

export function Premium() {
  const { t } = useI18n();

  return (
    <Section id="premium" title={t.premium.title} subtitle={t.premium.subtitle} tone="surface">
      <div className="surface-panel mx-auto max-w-4xl overflow-hidden p-0">
        <div className="gradient-warm flex items-center gap-3 px-6 py-5 text-primary-foreground">
          <Crown aria-hidden="true" className="size-6 shrink-0" />
          <p className="font-display text-xl font-semibold">{t.premium.title}</p>
        </div>
        <ul className="grid gap-4 p-6 sm:grid-cols-2 md:p-8">
          {t.premium.items.map((item) => (
            <li
              key={item}
              className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-background px-4 py-3"
            >
              <span className="min-w-0 text-sm font-medium">{item}</span>
              <Badge variant="outline" className="shrink-0 rounded-full text-xs">
                {t.premium.plannedBadge}
              </Badge>
            </li>
          ))}
        </ul>
        <div className="border-t border-border px-6 py-6 text-center md:px-8">
          <p className="text-sm text-muted-foreground">{t.premium.note}</p>
        </div>
      </div>
    </Section>
  );
}
