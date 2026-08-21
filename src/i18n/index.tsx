import { createContext, useContext, useMemo, type ReactNode } from "react";
import { en, type Dictionary } from "./en";

/**
 * LYVE ships in English only.
 *
 * The provider keeps a locale-shaped API so components stay unchanged, but
 * there is a single locale and the document direction is always LTR.
 */
export const LOCALES = ["en"] as const;
export type Locale = (typeof LOCALES)[number];

export const BASE_LOCALES: readonly Locale[] = ["en"];
export const DEFAULT_LOCALE: Locale = "en";

type I18nValue = {
  locale: Locale;
  dir: "ltr";
  t: Dictionary;
  /** Kept for API compatibility; there is nothing to switch to. */
  setLocale: (locale: Locale) => void;
  enabledLocales: readonly Locale[];
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const value = useMemo<I18nValue>(
    () => ({
      locale: DEFAULT_LOCALE,
      dir: "ltr",
      t: en,
      setLocale: () => {},
      enabledLocales: BASE_LOCALES,
    }),
    [],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
