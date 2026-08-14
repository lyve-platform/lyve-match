import { Heart, Infinity as InfinityIcon, Rings, Sparkles, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useI18n } from "@/i18n";
import { Section } from "./Section";

const icons: LucideIcon[] = [Sparkles, Heart, Rings, Users, InfinityIcon];

export function Intent() {
  const { t } = useI18n();

  return (
    <Section id="intent" title={t.intent.title} subtitle={t.intent.subtitle} tone="surface">
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {t.intent.items.map((item, index) => {
          const Icon = icons[index] ?? Sparkles;
          return (
            <li key={item.title} className="surface-panel p-6 transition-shadow hover:shadow-lift">
              <span
                aria-hidden="true"
                className="grid size-11 place-items-center rounded-2xl bg-primary-soft text-primary"
              >
                <Icon className="size-5" />
              </span>
              <h3 className="mt-4 text-lg font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{item.body}</p>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
