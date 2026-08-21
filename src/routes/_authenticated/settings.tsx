import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AccountShell } from "@/components/lyve/AccountShell";
import { BillingSettings } from "@/components/lyve/BillingSettings";
import { BlockedMembers } from "@/components/lyve/BlockedMembers";


import { PrivacyFields } from "@/routes/_authenticated/onboarding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useI18n } from "@/i18n";
import { useAuth } from "@/auth/AuthProvider";
import { useAccount } from "@/hooks/useAccount";
import {
  accountQueryKey,
  cancelAccountDeletion,
  requestAccountDeletion,
  updatePrivacy,
  type PrivacySettings,
} from "@/lib/account";
import { DELETION_GRACE_DAYS } from "@/config/lyve";
import { toErrorKey, type AppErrorKey } from "@/lib/auth-errors";

const title = "LYVE settings — privacy and account";
const description = "Manage your LYVE privacy controls, password, and account deletion request.";

export const Route = createFileRoute("/_authenticated/settings")({
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
  component: SettingsPage,
});

function SettingsPage() {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: account, isLoading } = useAccount();

  const [privacy, setPrivacy] = useState<PrivacySettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedPrivacy, setSavedPrivacy] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [errorKey, setErrorKey] = useState<AppErrorKey | null>(null);

  useEffect(() => {
    if (account) setPrivacy(account.privacy);
  }, [account]);

  if (isLoading || !account || !privacy || !user) {
    return (
      <AccountShell title={t.settingsPage.title} subtitle={t.settingsPage.subtitle}>
        <p className="text-sm text-muted-foreground">{t.auth.notices.loading}</p>
      </AccountShell>
    );
  }

  async function savePrivacy() {
    if (!user || !privacy) return;
    setBusy(true);
    setErrorKey(null);
    try {
      await updatePrivacy(user.id, {
        profile_visibility: privacy.profile_visibility,
        allow_messages: privacy.allow_messages,
        discoverable: privacy.discoverable,
        show_online_status: privacy.show_online_status,
        show_read_receipts: privacy.show_read_receipts,
      });
      await queryClient.invalidateQueries({ queryKey: accountQueryKey(user.id) });
      setSavedPrivacy(true);
    } catch (error) {
      setErrorKey(toErrorKey(error));
    } finally {
      setBusy(false);
    }
  }

  async function sendPasswordReset() {
    if (!user?.email) return;
    setBusy(true);
    setErrorKey(null);
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) return setErrorKey(toErrorKey(error));
    setResetSent(true);
  }

  async function handleDelete() {
    if (!user || !confirmed) return;
    setBusy(true);
    setErrorKey(null);
    try {
      await requestAccountDeletion(user.id, reason);
      await queryClient.cancelQueries();
      queryClient.clear();
      await supabase.auth.signOut();
      navigate({ to: "/", replace: true });
    } catch (error) {
      setBusy(false);
      setErrorKey(toErrorKey(error));
    }
  }

  async function handleCancelDeletion() {
    if (!user || !account?.deletionRequest) return;
    setBusy(true);
    setErrorKey(null);
    try {
      await cancelAccountDeletion(user.id, account.deletionRequest.id);
      await queryClient.invalidateQueries({ queryKey: accountQueryKey(user.id) });
    } catch (error) {
      setErrorKey(toErrorKey(error));
    } finally {
      setBusy(false);
    }
  }

  const pending = account.deletionRequest;
  const scheduledDate = pending
    ? new Intl.DateTimeFormat("en", { dateStyle: "long" }).format(
        new Date(new Date(pending.created_at).getTime() + DELETION_GRACE_DAYS * 86_400_000),
      )
    : null;

  return (
    <AccountShell title={t.settingsPage.title} subtitle={t.settingsPage.subtitle}>
      {errorKey ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm"
        >
          {t.auth.errors[errorKey]}
        </p>
      ) : null}

      <section aria-labelledby="privacy-heading" className="surface-panel space-y-5 p-5">
        <h2 id="privacy-heading" className="text-base font-semibold">
          {t.settingsPage.privacy.title}
        </h2>
        <PrivacyFields
          value={privacy}
          onChange={(next) => {
            setPrivacy((prev) => (prev ? { ...prev, ...next } : prev));
            setSavedPrivacy(false);
          }}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button className="min-h-11 rounded-full" disabled={busy} onClick={savePrivacy}>
            {busy ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
            {t.profilePage.save}
          </Button>
          {savedPrivacy ? (
            <span role="status" className="text-sm text-muted-foreground">
              {t.profilePage.saved}
            </span>
          ) : null}
        </div>
      </section>




      <section aria-labelledby="billing-heading" className="surface-panel space-y-3 p-5">
        <h2 id="billing-heading" className="text-base font-semibold">
          {t.billingSettings.title}
        </h2>
        <p className="text-sm text-muted-foreground">{t.billingSettings.subtitle}</p>
        <BillingSettings />
      </section>

      <section aria-labelledby="blocked-heading" className="surface-panel space-y-3 p-5">
        <h2 id="blocked-heading" className="text-base font-semibold">
          {t.blockedList.title}
        </h2>
        <p className="text-sm text-muted-foreground">{t.blockedList.hint}</p>
        <BlockedMembers />
      </section>

      <section aria-labelledby="account-heading" className="surface-panel space-y-4 p-5">
        <h2 id="account-heading" className="text-base font-semibold">
          {t.settingsPage.account.title}
        </h2>
        <div className="space-y-1.5">
          <Label htmlFor="account-email">{t.settingsPage.account.email}</Label>
          <Input id="account-email" value={user.email ?? ""} readOnly disabled />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            className="min-h-11 rounded-full"
            disabled={busy}
            onClick={sendPasswordReset}
          >
            {t.settingsPage.account.changePassword}
          </Button>
          {resetSent ? (
            <span role="status" className="text-sm text-muted-foreground">
              {t.auth.notices.resetSent}
            </span>
          ) : null}
        </div>
      </section>

      <section
        aria-labelledby="deletion-heading"
        className="rounded-2xl border border-destructive/40 bg-destructive/5 p-5"
      >
        <h2 id="deletion-heading" className="text-base font-semibold">
          {t.settingsPage.deletion.title}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{t.settingsPage.deletion.body}</p>

        {pending ? (
          <div className="mt-4 space-y-3">
            <p role="status" className="text-sm text-foreground">
              {t.settingsPage.deletion.pendingNotice.replace("{date}", scheduledDate ?? "")}
            </p>
            <Button
              variant="outline"
              className="min-h-11 rounded-full"
              disabled={busy}
              onClick={handleCancelDeletion}
            >
              {t.settingsPage.deletion.cancel}
            </Button>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div>
              <h3 className="text-sm font-medium">{t.settingsPage.deletion.whatHappensTitle}</h3>
              <ul className="mt-2 list-disc space-y-1 ps-5 text-sm text-muted-foreground">
                {t.settingsPage.deletion.whatHappens.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="deletion-reason">{t.settingsPage.deletion.reasonLabel}</Label>
              <Textarea
                id="deletion-reason"
                rows={3}
                maxLength={500}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
            <div className="flex items-start gap-3">
              <Checkbox
                id="deletion-confirm"
                checked={confirmed}
                onCheckedChange={(checked) => setConfirmed(checked === true)}
              />
              <Label htmlFor="deletion-confirm" className="text-sm font-normal">
                {t.settingsPage.deletion.confirmLabel}
              </Label>
            </div>
            <Button
              variant="destructive"
              className="min-h-11 rounded-full"
              disabled={busy || !confirmed}
              onClick={handleDelete}
            >
              {busy ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
              {t.settingsPage.deletion.request}
            </Button>
          </div>
        )}
      </section>
    </AccountShell>
  );
}
