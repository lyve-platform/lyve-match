import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { en, type Dictionary } from "./en";
import { ar } from "./ar";

export const LOCALES = ["en", "ar"] as const;
export type Locale = (typeof LOCALES)[number];

/**
 * Production language strategy: English-only for the initial launch.
 * The Arabic dictionary and RTL architecture stay in the codebase; to activate
 * Arabic later, add "ar" here (then review translations and run RTL QA).
 */
export const ENABLED_LOCALES: readonly Locale[] = ["en"];
export const DEFAULT_LOCALE: Locale = "en";
export const isLocaleEnabled = (value: Locale) => ENABLED_LOCALES.includes(value);

const dictionaries: Record<Locale, Dictionary> = { en, ar };
const STORAGE_KEY = "lyve.locale";

type I18nValue = {
  locale: Locale;
  dir: "ltr" | "rtl";
  t: Dictionary;
  setLocale: (locale: Locale) => void;
};

const I18nContext = createContext<I18nValue | null>(null);

function isLocale(value: string | null): value is Locale {
  return value === "en" || value === "ar";
}

function isSelectable(value: string | null): value is Locale {
  return isLocale(value) && isLocaleEnabled(value);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isSelectable(stored)) {
      setLocaleState(stored);
      return;
    }
    if (
      typeof navigator !== "undefined" &&
      navigator.language?.startsWith("ar") &&
      isLocaleEnabled("ar")
    ) {
      setLocaleState("ar");
    }
  }, []);

  const dir = locale === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
  }, [locale, dir]);

  const setLocale = useCallback((next: Locale) => {
    if (!isLocaleEnabled(next)) return;
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage unavailable — keep in-memory locale */
    }
  }, []);

  const value = useMemo<I18nValue>(
    () => ({ locale, dir, t: dictionaries[locale], setLocale }),
    [locale, dir, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
