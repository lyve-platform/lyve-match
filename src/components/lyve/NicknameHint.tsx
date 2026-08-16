import { useI18n } from "@/i18n";
import type { NicknameStatus } from "@/hooks/useNicknameAvailability";

export function NicknameHint({ status }: { status: NicknameStatus }) {
  const { t } = useI18n();
  if (status === "idle") return null;

  const copy = t.auth.nickname;
  const message =
    status === "checking"
      ? copy.checking
      : status === "available"
        ? copy.available
        : status === "taken"
          ? copy.taken
          : status === "invalid"
            ? copy.invalid
            : copy.error;

  const tone =
    status === "available"
      ? "text-emerald-600 dark:text-emerald-400"
      : status === "checking"
        ? "text-muted-foreground"
        : "text-destructive";

  return (
    <p aria-live="polite" className={`text-xs ${tone}`}>
      {message}
    </p>
  );
}
