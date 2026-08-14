import { useI18n } from "@/i18n";
import { Section } from "./Section";

export function HowItWorks() {
  const { t } = useI18n();

  return (
    <Section id="how-it-works" title={t.how.title} subtitle={t.how.subtitle} tone="surface">
      <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {t.how.steps.map((step, index) => (
          <li key={step.title} className="surface-panel p-6">
            <span
              aria-hidden="true"
              className="grid size-10 place-items-center rounded-xl bg-primary-soft font-display text-lg font-semibold text-foreground"
            >
              {index + 1}
            </span>
            <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{step.body}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
