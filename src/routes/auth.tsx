import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuthShell } from "@/components/auth/AuthShell";
import { PasswordField } from "@/components/auth/PasswordField";
import { DateOfBirthField } from "@/components/auth/DateOfBirthField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n";
import { useAuth } from "@/auth/AuthProvider";
import { checkDateOfBirth, toIsoDate, type DateParts } from "@/lib/age";
import { emailSchema, passwordSchema, firstNameSchema, isValid } from "@/lib/validation";
import { toErrorKey, type AppErrorKey } from "@/lib/auth-errors";

const title = "Sign in to LYVE — Meet. Match. Belong.";
const description =
  "Sign in to LYVE or create your 18+ account to build a profile, set your intent, and find meaningful connections.";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:url", content: "https://lyve-connect-build.lovable.app/auth" },
      { property: "og:image", content: "https://lyve-connect-build.lovable.app/og-image.jpg" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "LYVE — Meet. Match. Belong." },
      { name: "twitter:image", content: "https://lyve-connect-build.lovable.app/og-image.jpg" },
      { name: "twitter:image:alt", content: "LYVE — Meet. Match. Belong." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "forgot";
type Notice = "checkEmail" | "resetSent" | "verificationResent" | null;

function AuthPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { isAuthenticated, loading: sessionLoading } = useAuth();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [dob, setDob] = useState<DateParts>({ day: "", month: "", year: "" });
  const [errorKey, setErrorKey] = useState<AppErrorKey | null>(null);
  const [underage, setUnderage] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!sessionLoading && isAuthenticated) {
      navigate({ to: "/profile", replace: true });
    }
  }, [isAuthenticated, sessionLoading, navigate]);

  function resetFeedback() {
    setErrorKey(null);
    setUnderage(false);
    setNotice(null);
  }

  async function handleSignIn(event: FormEvent) {
    event.preventDefault();
    resetFeedback();
    if (!isValid(emailSchema, email)) return setErrorKey("invalidEmail");
    if (!password) return setErrorKey("missingFields");

    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) return setErrorKey(toErrorKey(error));
    navigate({ to: "/profile", replace: true });
  }

  async function handleSignUp(event: FormEvent) {
    event.preventDefault();
    resetFeedback();

    if (!isValid(firstNameSchema, firstName)) return setErrorKey("missingFields");
    if (!isValid(emailSchema, email)) return setErrorKey("invalidEmail");
    if (!isValid(passwordSchema, password)) return setErrorKey("weakPassword");
    if (password !== confirmPassword) return setErrorKey("passwordMismatch");

    const isoDob = toIsoDate(dob);
    const dobCheck = checkDateOfBirth(isoDob);
    if (dobCheck === "invalid") return setErrorKey("invalidDob");
    if (dobCheck === "underage") {
      setUnderage(true);
      return;
    }

    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth`,
        data: { first_name: firstName.trim(), date_of_birth: isoDob },
      },
    });
    setBusy(false);
    if (error) return setErrorKey(toErrorKey(error));
    setNotice("checkEmail");
  }

  async function handleForgot(event: FormEvent) {
    event.preventDefault();
    resetFeedback();
    if (!isValid(emailSchema, email)) return setErrorKey("invalidEmail");

    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error && toErrorKey(error) === "rateLimited") return setErrorKey("rateLimited");
    setNotice("resetSent");
  }

  async function handleResend() {
    resetFeedback();
    if (!isValid(emailSchema, email)) return setErrorKey("invalidEmail");
    setBusy(true);
    const { error } = await supabase.auth.resend({ type: "signup", email: email.trim() });
    setBusy(false);
    if (error) return setErrorKey(toErrorKey(error));
    setNotice("verificationResent");
  }

  const shellTitle =
    mode === "forgot"
      ? t.auth.forgotTitle
      : mode === "signup"
        ? t.auth.signUpTitle
        : t.auth.signInTitle;
  const shellSubtitle =
    mode === "forgot"
      ? t.auth.forgotSubtitle
      : mode === "signup"
        ? t.auth.signUpSubtitle
        : t.auth.signInSubtitle;

  return (
    <AuthShell title={shellTitle} subtitle={shellSubtitle}>
      {mode !== "forgot" ? (
        <div
          role="tablist"
          aria-label={t.auth.pageTitle}
          className="mb-6 grid grid-cols-2 gap-1 rounded-full bg-muted p-1"
        >
          {(["signin", "signup"] as const).map((value) => (
            <button
              key={value}
              role="tab"
              type="button"
              aria-selected={mode === value}
              onClick={() => {
                setMode(value);
                resetFeedback();
              }}
              className={`min-h-11 rounded-full px-4 text-sm font-medium transition-colors ${
                mode === value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {value === "signin" ? t.auth.tabSignIn : t.auth.tabSignUp}
            </button>
          ))}
        </div>
      ) : null}

      {underage ? (
        <div
          role="alert"
          className="mb-5 rounded-xl border border-destructive/40 bg-destructive/10 p-4"
        >
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <AlertCircle aria-hidden="true" className="size-4" />
            {t.auth.ageGate.title}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{t.auth.ageGate.body}</p>
        </div>
      ) : null}

      {errorKey ? (
        <p
          role="alert"
          className="mb-5 flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-foreground"
        >
          <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {t.auth.errors[errorKey]}
        </p>
      ) : null}

      {notice ? (
        <p
          role="status"
          className="mb-5 flex items-start gap-2 rounded-xl border border-border bg-muted p-3 text-sm text-foreground"
        >
          <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
          {t.auth.notices[notice]}
        </p>
      ) : null}

      {mode === "signin" ? (
        <form onSubmit={handleSignIn} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="signin-email">{t.auth.fields.email}</Label>
            <Input
              id="signin-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <PasswordField
            id="signin-password"
            label={t.auth.fields.password}
            value={password}
            onChange={setPassword}
          />
          <Button type="submit" className="min-h-11 w-full rounded-full" disabled={busy}>
            {busy ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
            {t.auth.actions.signIn}
          </Button>
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <button
              type="button"
              className="rounded px-1 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              onClick={() => {
                setMode("forgot");
                resetFeedback();
              }}
            >
              {t.auth.actions.forgotPassword}
            </button>
            <button
              type="button"
              className="rounded px-1 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              onClick={handleResend}
            >
              {t.auth.actions.resendVerification}
            </button>
          </div>
        </form>
      ) : null}

      {mode === "signup" ? (
        <form onSubmit={handleSignUp} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="signup-name">{t.auth.fields.firstName}</Label>
            <Input
              id="signup-name"
              autoComplete="given-name"
              maxLength={60}
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="signup-email">{t.auth.fields.email}</Label>
            <Input
              id="signup-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <PasswordField
            id="signup-password"
            label={t.auth.fields.password}
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            hint={t.auth.hints.password}
          />
          <PasswordField
            id="signup-confirm"
            label={t.auth.fields.confirmPassword}
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
          />
          <DateOfBirthField value={dob} onChange={setDob} idPrefix="signup-dob" />
          <Button type="submit" className="min-h-11 w-full rounded-full" disabled={busy}>
            {busy ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
            {t.auth.actions.signUp}
          </Button>
          <p className="text-xs text-muted-foreground">
            <Link to="/terms" className="underline underline-offset-4">
              {t.legal.pages.terms.title}
            </Link>
            {" · "}
            <Link to="/privacy" className="underline underline-offset-4">
              {t.legal.pages.privacy.title}
            </Link>
          </p>
        </form>
      ) : null}

      {mode === "forgot" ? (
        <form onSubmit={handleForgot} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="forgot-email">{t.auth.fields.email}</Label>
            <Input
              id="forgot-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <Button type="submit" className="min-h-11 w-full rounded-full" disabled={busy}>
            {busy ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
            {t.auth.actions.sendResetLink}
          </Button>
          <button
            type="button"
            className="w-full rounded px-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            onClick={() => {
              setMode("signin");
              resetFeedback();
            }}
          >
            {t.auth.actions.backToSignIn}
          </button>
        </form>
      ) : null}
    </AuthShell>
  );
}
