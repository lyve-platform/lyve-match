import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { useTheme } from "@/theme";

export function ThemeToggle({ className }: { className?: string }) {
  const { t } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={toggleTheme}
      aria-pressed={isDark}
      aria-label={isDark ? t.theme.switchToLight : t.theme.switchToDark}
      title={isDark ? t.theme.switchToLight : t.theme.switchToDark}
      className={cn("min-h-11 min-w-11 rounded-full", className)}
    >
      {isDark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
      <span className="sr-only">{isDark ? t.theme.switchToLight : t.theme.switchToDark}</span>
    </Button>
  );
}
