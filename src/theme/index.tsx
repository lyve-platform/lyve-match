import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "lyve.theme";

/**
 * Runs before hydration so the correct theme class is present on first paint.
 * Kept in sync with STORAGE_KEY above.
 */
export const themeInitScript = `(function(){try{var s=localStorage.getItem("lyve.theme");var t=(s==="light"||s==="dark")?s:(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");var e=document.documentElement;e.classList.toggle("dark",t==="dark");}catch(_){}})();`;

type ThemeValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeValue | null>(null);

function isTheme(value: string | null): value is Theme {
  return value === "light" || value === "dark";
}

function apply(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");
  const [explicit, setExplicit] = useState(false);

  // First visit: stored preference wins, otherwise follow the operating system.
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      /* storage unavailable */
    }
    if (isTheme(stored)) {
      setExplicit(true);
      setThemeState(stored);
      apply(stored);
      return;
    }
    const system: Theme = window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
    setThemeState(system);
    apply(system);
  }, []);

  // Keep following the system while the user has not chosen explicitly.
  useEffect(() => {
    if (explicit) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => {
      const next: Theme = event.matches ? "dark" : "light";
      setThemeState(next);
      apply(next);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [explicit]);

  const setTheme = useCallback((next: Theme) => {
    setExplicit(true);
    setThemeState(next);
    apply(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage unavailable — keep in-memory theme */
    }
  }, []);

  const value = useMemo<ThemeValue>(
    () => ({
      theme,
      setTheme,
      toggleTheme: () => setTheme(theme === "dark" ? "light" : "dark"),
    }),
    [theme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
