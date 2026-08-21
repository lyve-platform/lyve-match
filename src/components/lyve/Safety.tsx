import { BadgeCheck, Ban, EyeOff, Flag, Gavel, ShieldAlert, UserCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n";
import { Section } from "./Section";

const icons: LucideIcon[] = [UserCheck, Flag, Ban, BadgeCheck, EyeOff, ShieldAlert, Gavel];
/** Indices of protections not yet operational — must stay clearly marked. */
const plannedIndices = new Set([5, 6]);

export function Safety() {
  const { t } = useI18n();

  return (
    <Section id="safety" title={t.safety.title} subtitle={t.safety.subtitle}>
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {t.safety.items.map((item, index) => {
          const Icon = icons[index] ?? ShieldAlert;
          return (
            <li key={item.title} className="surface-panel p-6">
              <div className="flex items-start justify-between gap-3">
                <span
                  aria-hidden="true"
                  className="grid size-11 place-items-center rounded-2xl bg-muted text-secondary"
                >
                  <Icon className="size-5" />
                </span>
                {plannedIndices.has(index) ? (
                  <Badge variant="outline" className="rounded-full text-xs">
                    {t.safety.plannedBadge}
                  </Badge>
                ) : null}
              </div>
              <h3 className="mt-4 text-lg font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{item.body}</p>
            </li>
          );
        })}
      </ul>
      <p className="mx-auto mt-8 max-w-2xl rounded-2xl border border-border bg-muted px-5 py-4 text-center text-sm text-muted-foreground">
        {t.safety.note}
      </p>
    </Section>
  );
}
