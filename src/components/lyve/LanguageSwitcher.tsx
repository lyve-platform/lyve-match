import { Globe } from "lucide-react";
import { LOCALES, useI18n, type Locale } from "@/i18n";
import { cn } from "@/lib/utils";

const labels: Record<Locale, string> = { en: "English", ar: "العربية" };

export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border bg-card p-1",
        className,
      )}
      role="group"
      aria-label={t.nav.changeLanguage}
    >
      <Globe aria-hidden="true" className="ms-2 size-4 text-muted-foreground" />
      {LOCALES.map((code) => (
        <button
          key={code}
          type="button"
          lang={code}
          onClick={() => setLocale(code)}
          aria-pressed={locale === code}
          className={cn(
            "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
            locale === code
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {labels[code]}
        </button>
      ))}
    </div>
  );
}
