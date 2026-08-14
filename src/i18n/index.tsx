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

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isLocale(stored)) {
      setLocaleState(stored);
      return;
    }
    if (typeof navigator !== "undefined" && navigator.language?.startsWith("ar")) {
      setLocaleState("ar");
    }
  }, []);

  const dir = locale === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
  }, [locale, dir]);

  const setLocale = useCallback((next: Locale) => {
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
