import { useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuthShell } from "@/components/auth/AuthShell";
import { PasswordField } from "@/components/auth/PasswordField";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { passwordSchema, isValid } from "@/lib/validation";
import { toErrorKey, type AppErrorKey } from "@/lib/auth-errors";

const title = "Choose a new password — LYVE";
const description = "Set a new password for your LYVE account and get back to your profile.";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorKey, setErrorKey] = useState<AppErrorKey | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErrorKey(null);
    if (!isValid(passwordSchema, password)) return setErrorKey("weakPassword");
    if (password !== confirmPassword) return setErrorKey("passwordMismatch");

    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setBusy(false);
      return setErrorKey(toErrorKey(error));
    }
    await supabase.auth.signOut();
    setBusy(false);
    setDone(true);
  }

  return (
    <AuthShell title={t.auth.resetTitle} subtitle={t.auth.resetSubtitle}>
      {errorKey ? (
        <p
          role="alert"
          className="mb-5 flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-foreground"
        >
          <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {t.auth.errors[errorKey]}
        </p>
      ) : null}

      {done ? (
        <div className="space-y-4">
          <p
            role="status"
            className="flex items-start gap-2 rounded-xl border border-border bg-muted p-3 text-sm text-foreground"
          >
            <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
            {t.auth.notices.passwordUpdated}
          </p>
          <Button
            className="min-h-11 w-full rounded-full"
            onClick={() => navigate({ to: "/auth", replace: true })}
          >
            {t.auth.actions.backToSignIn}
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <PasswordField
            id="reset-password"
            label={t.auth.fields.newPassword}
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            hint={t.auth.hints.password}
          />
          <PasswordField
            id="reset-confirm"
            label={t.auth.fields.confirmPassword}
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
          />
          <Button type="submit" className="min-h-11 w-full rounded-full" disabled={busy}>
            {busy ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
            {t.auth.actions.updatePassword}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
