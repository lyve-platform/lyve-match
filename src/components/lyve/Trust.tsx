import { BadgeCheck, MessageSquareOff } from "lucide-react";
import { useI18n } from "@/i18n";
import { Section } from "./Section";

/**
 * Public explainer for the two concerns members raise most: fake profiles
 * (catfishing) and unwanted messages. Only controls that actually run today.
 */
export function Trust() {
  const { t } = useI18n();

  const columns = [
    { icon: BadgeCheck, title: t.trust.catfishTitle, items: t.trust.catfishItems },
    { icon: MessageSquareOff, title: t.trust.spamTitle, items: t.trust.spamItems },
  ];

  return (
    <Section id="trust" title={t.trust.title} subtitle={t.trust.subtitle}>
      <div className="grid gap-5 md:grid-cols-2">
        {columns.map(({ icon: Icon, title, items }) => (
          <div key={title} className="surface-panel p-6">
            <span
              aria-hidden="true"
              className="grid size-11 place-items-center rounded-2xl bg-muted text-secondary"
            >
              <Icon className="size-5" />
            </span>
            <h3 className="mt-4 text-lg font-semibold">{title}</h3>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              {items.map((item) => (
                <li key={item} className="flex gap-2">
                  <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mx-auto mt-8 max-w-2xl rounded-2xl border border-border bg-muted px-5 py-4 text-center text-sm text-muted-foreground">
        {t.trust.note}
      </p>
    </Section>
  );
}
