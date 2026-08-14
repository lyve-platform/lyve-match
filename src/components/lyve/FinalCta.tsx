import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n";

export function FinalCta() {
  const { t } = useI18n();
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDone(false);
    const value = email.trim();
    if (!value) {
      setError(t.cta.errorRequired);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
      setError(t.cta.errorInvalid);
      return;
    }
    setError(null);
    setDone(true);
  }

  return (
    <section
      id="final-cta"
      aria-labelledby="final-cta-heading"
      className="scroll-mt-24 px-4 py-16 sm:px-6 md:py-24"
    >
      <div className="gradient-warm mx-auto max-w-4xl rounded-3xl px-6 py-12 text-center text-primary-foreground shadow-lift md:px-12">
        <h2 id="final-cta-heading" className="text-balance text-3xl font-semibold md:text-4xl">
          {t.cta.title}
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-pretty text-base opacity-90">{t.cta.body}</p>

        <form onSubmit={onSubmit} noValidate className="mx-auto mt-8 max-w-md text-start">
          <Label htmlFor={inputId} className="text-primary-foreground">
            {t.cta.emailLabel}
          </Label>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row">
            <Input
              id={inputId}
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder={t.cta.emailPlaceholder}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              className="min-h-11 rounded-full border-transparent bg-background text-foreground"
            />
            <Button
              type="submit"
              variant="secondary"
              className="min-h-11 shrink-0 rounded-full"
            >
              {t.cta.submit}
            </Button>
          </div>
          <p id={errorId} role="alert" className="mt-2 min-h-5 text-sm">
            {error}
          </p>
          <p aria-live="polite" className="text-sm opacity-90">
            {done ? t.cta.success : ""}
          </p>
        </form>

        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <Button asChild size="lg" variant="secondary" className="rounded-full px-7">
            <a href="#top">{t.cta.primary}</a>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="rounded-full border-primary-foreground/40 bg-transparent px-7 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
          >
            <a href="#how-it-works">{t.cta.secondary}</a>
          </Button>
        </div>
      </div>
    </section>
  );
}
