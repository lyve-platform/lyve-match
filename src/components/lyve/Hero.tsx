import { ArrowRight, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n";
import { CompatibilityRing } from "./CompatibilityRing";

export function Hero() {
  const { t } = useI18n();

  return (
    <section id="top" className="relative overflow-hidden px-4 pb-16 pt-12 sm:px-6 md:pb-24 md:pt-20">
      <div
        aria-hidden="true"
        className="gradient-veil pointer-events-none absolute inset-x-0 top-0 h-[420px]"
      />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="text-center lg:text-start">
          <Badge
            variant="secondary"
            className="rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-foreground"
          >
            {t.hero.eyebrow}
          </Badge>

          <h1 className="mt-6 font-display text-5xl font-semibold leading-[1.05] md:text-7xl">
            <span className="text-gradient-warm">{t.hero.title}</span>
            <span className="mt-3 block text-2xl font-medium text-foreground md:text-3xl">
              {t.hero.tagline}
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-pretty text-lg text-muted-foreground lg:mx-0">
            {t.hero.supporting}
          </p>

          <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:justify-center lg:justify-start">
            <Button asChild size="lg" className="rounded-full px-7">
              <a href="#final-cta">
                {t.hero.primaryCta}
                <ArrowRight aria-hidden="true" className="rtl:rotate-180" />
              </a>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-full px-7">
              <a href="#how-it-works">{t.hero.secondaryCta}</a>
            </Button>
          </div>

          <p className="mt-6 flex items-start justify-center gap-2 text-sm text-muted-foreground lg:justify-start">
            <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
            <span className="max-w-md text-start">{t.hero.note}</span>
          </p>
        </div>

        <div className="relative mx-auto w-full max-w-sm">
          <div className="surface-panel relative overflow-hidden p-6 shadow-lift">
            <div className="flex items-center gap-3">
              <div
                aria-hidden="true"
                className="gradient-warm grid size-14 shrink-0 place-items-center rounded-2xl font-display text-xl text-primary-foreground"
              >
                <Sparkles className="size-6" />
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{t.hero.cardName}</p>
                <p className="truncate text-sm text-muted-foreground">{t.hero.cardMeta}</p>
              </div>
            </div>

            <div className="mt-6 grid place-items-center">
              <CompatibilityRing value={87} label={t.compatibility.scoreLabel} />
            </div>

            <ul className="mt-6 space-y-2">
              {t.compatibility.reasons.slice(0, 3).map((reason) => (
                <li
                  key={reason}
                  className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-sm text-foreground"
                >
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />
                  {reason}
                </li>
              ))}
            </ul>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Badge className="rounded-full bg-secondary text-secondary-foreground">
                {t.hero.cardIntent}
              </Badge>
              <Badge variant="outline" className="rounded-full">
                {t.compatibility.exampleBadge}
              </Badge>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
