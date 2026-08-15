import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { en, type Dictionary } from "./en";
import { ar } from "./ar";

export const LOCALES = ["en", "ar"] as const;
export type Locale = (typeof LOCALES)[number];

/**
 * Language availability is a server-controlled feature flag.
 *
 * English is always available. Arabic is only selectable when an administrator
 * has enabled it in the backend (`locale_availability()`), so localStorage, a
 * URL parameter or an Arabic browser language can never force Arabic on their
 * own. The Arabic dictionary always stays in the codebase.
 */
export const BASE_LOCALES: readonly Locale[] = ["en"];
export const DEFAULT_LOCALE: Locale = "en";

const dictionaries: Record<Locale, Dictionary> = { en, ar };
const STORAGE_KEY = "lyve.locale";

type I18nValue = {
  locale: Locale;
  dir: "ltr" | "rtl";
  t: Dictionary;
  setLocale: (locale: Locale) => void;
  /** Locales the server currently allows. Always contains "en". */
  enabledLocales: readonly Locale[];
  arabicEnabled: boolean;
  refreshAvailability: () => Promise<void>;
};

const I18nContext = createContext<I18nValue | null>(null);

function isLocale(value: string | null): value is Locale {
  return value === "en" || value === "ar";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [preferred, setPreferred] = useState<Locale>(DEFAULT_LOCALE);
  const [arabicEnabled, setArabicEnabled] = useState(false);

  const refreshAvailability = useCallback(async () => {
    const { data, error } = await supabase.rpc("locale_availability");
    setArabicEnabled(!error && data === true);
  }, []);

  useEffect(() => {
    void refreshAvailability();
  }, [refreshAvailability]);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      /* storage unavailable */
    }
    if (isLocale(stored)) {
      setPreferred(stored);
      return;
    }
    if (typeof navigator !== "undefined" && navigator.language?.startsWith("ar")) {
      setPreferred("ar");
    }
  }, []);

  const enabledLocales = useMemo<readonly Locale[]>(
    () => (arabicEnabled ? (["en", "ar"] as const) : BASE_LOCALES),
    [arabicEnabled],
  );

  // The effective locale is always re-derived from server state.
  const locale: Locale = enabledLocales.includes(preferred) ? preferred : DEFAULT_LOCALE;
  const dir = locale === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
  }, [locale, dir]);

  const setLocale = useCallback(
    (next: Locale) => {
      if (!enabledLocales.includes(next)) return;
      setPreferred(next);
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* storage unavailable — keep in-memory locale */
      }
    },
    [enabledLocales],
  );

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      dir,
      t: dictionaries[locale],
      setLocale,
      enabledLocales,
      arabicEnabled,
      refreshAvailability,
    }),
    [locale, dir, setLocale, enabledLocales, arabicEnabled, refreshAvailability],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
