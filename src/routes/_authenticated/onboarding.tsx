import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { AccountShell } from "@/components/lyve/AccountShell";
import { PhotoManager } from "@/components/lyve/PhotoManager";
import { DateOfBirthField } from "@/components/auth/DateOfBirthField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/i18n";
import { useAuth } from "@/auth/AuthProvider";
import { useNicknameAvailability } from "@/hooks/useNicknameAvailability";
import { NicknameHint } from "@/components/lyve/NicknameHint";
import { useAccount, useInterests } from "@/hooks/useAccount";
import {
  accountQueryKey,
  saveOnboardingProgress,
  setInterests,
  updatePreferences,
  updatePrivacy,
  updateProfile,
} from "@/lib/account";
import {
  GENDERS,
  MESSAGE_AUDIENCES,
  ONBOARDING_STEPS,
  PROFILE_VISIBILITIES,
  RELATIONSHIP_INTENTS,
  type OnboardingStepKey,
} from "@/config/lyve";
import { checkDateOfBirth, splitIsoDate, toIsoDate, type DateParts } from "@/lib/age";
import { toErrorKey, type AppErrorKey } from "@/lib/auth-errors";

const title = "Complete your LYVE profile";
const description = "Set your intent, add photos, and choose your privacy settings on LYVE.";

export const Route = createFileRoute("/_authenticated/onboarding")({
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
  component: OnboardingPage,
});

function OnboardingPage() {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: account, isLoading } = useAccount();
  const { data: interests } = useInterests();

  const [stepIndex, setStepIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<AppErrorKey | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown> | null>(null);

  const state = useMemo(() => {
    if (!account) return null;
    return {
      dob: splitIsoDate(account.profile.date_of_birth),
      firstName: account.profile.first_name ?? "",
      gender: account.profile.gender,
      intent: account.profile.relationship_intent,
      city: account.profile.city ?? "",
      country: account.profile.country ?? "",
      occupation: account.profile.occupation ?? "",
      education: account.profile.education ?? "",
      bio: account.profile.bio ?? "",
      interestIds: account.interestIds,
      preferredGenders: account.preferences.preferred_genders,
      intents: account.preferences.intents,
      minAge: account.preferences.min_age,
      maxAge: account.preferences.max_age,
      privacy: account.privacy,
    };
  }, [account]);

  const nicknameDraft =
    typeof draft?.["firstName"] === "string"
      ? (draft["firstName"] as string)
      : (account?.profile.first_name ?? "");
  const nicknameStatus = useNicknameAvailability(
    nicknameDraft,
    account?.profile.first_name ?? null,
  );

  if (isLoading || !account || !state || !user) {
    return (
      <AccountShell title={t.onboarding.title} subtitle={t.onboarding.subtitle}>
        <p className="text-sm text-muted-foreground">{t.auth.notices.loading}</p>
      </AccountShell>
    );
  }

  const value = <K extends keyof typeof state>(key: K): (typeof state)[K] =>
    draft && key in draft ? (draft[key as string] as (typeof state)[K]) : state[key];

  const set = (key: string, next: unknown) =>
    setDraft((prev) => ({ ...(prev ?? {}), [key]: next }));

  const step = ONBOARDING_STEPS[stepIndex]!;
  const stepKey = step.key as OnboardingStepKey;
  const stepCopy = t.onboarding.steps[stepKey];

  async function persist(): Promise<boolean> {
    if (!user) return false;
    setErrorKey(null);
    setBusy(true);
    try {
      switch (stepKey) {
        case "date_of_birth": {
          const iso = toIsoDate(value("dob") as DateParts);
          const check = checkDateOfBirth(iso);
          if (check === "invalid") throw new Error("invalid dob");
          if (check === "underage") throw new Error("underage");
          await updateProfile(user.id, { date_of_birth: iso });
          break;
        }
        case "name":
          if (nicknameStatus === "taken") throw new Error("nickname taken");
          await updateProfile(user.id, {
            first_name: (value("firstName") as string).trim() || null,
          });
          break;
        case "gender":
          await updateProfile(user.id, { gender: value("gender") });
          break;
        case "intent":
          await updateProfile(user.id, { relationship_intent: value("intent") });
          break;
        case "location":
          await updateProfile(user.id, {
            city: (value("city") as string).trim() || null,
            country: (value("country") as string).trim() || null,
          });
          break;
        case "lifestyle":
          await updateProfile(user.id, {
            occupation: (value("occupation") as string).trim() || null,
            education: (value("education") as string).trim() || null,
          });
          break;
        case "bio":
          await updateProfile(user.id, { bio: (value("bio") as string).trim() || null });
          break;
        case "interests":
          await setInterests(user.id, value("interestIds") as string[]);
          break;
        case "interested_in":
          await updatePreferences(user.id, { preferred_genders: value("preferredGenders") });
          break;
        case "preferences":
          await updatePreferences(user.id, {
            intents: value("intents"),
            min_age: value("minAge"),
            max_age: value("maxAge"),
          });
          break;
        case "privacy":
          await updatePrivacy(user.id, value("privacy"));
          break;
        default:
          break;
      }

      const completed = Array.from(new Set([...account!.onboarding.completed_steps, stepKey]));
      const nextStep = ONBOARDING_STEPS[stepIndex + 1]?.key ?? stepKey;
      await saveOnboardingProgress(user.id, {
        completed_steps: completed,
        current_step: nextStep,
        is_complete: stepKey === "completion" ? true : account!.onboarding.is_complete,
      });
      await queryClient.invalidateQueries({ queryKey: accountQueryKey(user.id) });
      setDraft(null);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setErrorKey(
        message === "underage"
          ? "underage"
          : message === "invalid dob"
            ? "invalidDob"
            : toErrorKey(error),
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function goNext() {
    const ok = await persist();
    if (!ok) return;
    if (stepIndex >= ONBOARDING_STEPS.length - 1) {
      navigate({ to: "/discover" });
      return;
    }
    setStepIndex((index) => index + 1);
  }

  async function finishNow() {
    if (!user) return;
    setErrorKey(null);
    setBusy(true);
    try {
      // Persist any in-progress draft before finishing.
      await persist();
      const completed = Array.from(
        new Set([...account!.onboarding.completed_steps, stepKey, "completion"]),
      );
      await saveOnboardingProgress(user.id, {
        completed_steps: completed,
        current_step: "completion",
        is_complete: true,
      });
      await queryClient.invalidateQueries({ queryKey: accountQueryKey(user.id) });
      navigate({ to: "/discover" });
    } catch (error) {
      setErrorKey(toErrorKey(error));
    } finally {
      setBusy(false);
    }
  }

  function toggleIn<T>(list: readonly T[], item: T): T[] {
    return list.includes(item) ? list.filter((value) => value !== item) : [...list, item];
  }


  return (
    <AccountShell title={t.onboarding.title} subtitle={t.onboarding.subtitle}>
      <p className="text-sm text-muted-foreground">
        {t.onboarding.stepOf
          .replace("{current}", String(stepIndex + 1))
          .replace("{total}", String(ONBOARDING_STEPS.length))}
      </p>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={stepIndex + 1}
        aria-valuemin={1}
        aria-valuemax={ONBOARDING_STEPS.length}
        aria-label={t.onboarding.title}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500"
          style={{ width: `${((stepIndex + 1) / ONBOARDING_STEPS.length) * 100}%` }}
        />
      </div>

      <section aria-labelledby="step-heading" className="surface-panel space-y-5 p-5">
        <div>
          <h2 id="step-heading" className="text-lg font-semibold">
            {stepCopy.title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{stepCopy.body}</p>
        </div>

        {errorKey ? (
          <p
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm"
          >
            {t.auth.errors[errorKey]}
          </p>
        ) : null}

        {stepKey === "date_of_birth" ? (
          <DateOfBirthField
            value={value("dob") as DateParts}
            onChange={(next) => set("dob", next)}
            idPrefix="onboarding-dob"
          />
        ) : null}

        {stepKey === "name" ? (
          <div className="space-y-1.5">
            <Label htmlFor="onboarding-name">{t.auth.fields.firstName}</Label>
            <Input
              id="onboarding-name"
              maxLength={60}
              value={value("firstName") as string}
              onChange={(event) => set("firstName", event.target.value)}
              aria-invalid={nicknameStatus === "taken"}
            />
            <NicknameHint status={nicknameStatus} />
          </div>
        ) : null}

        {stepKey === "gender" ? (
          <fieldset className="flex flex-wrap gap-2">
            <legend className="sr-only">{stepCopy.label}</legend>
            {GENDERS.map((gender) => (
              <ChoiceChip
                key={gender}
                selected={value("gender") === gender}
                label={t.enums.gender[gender]}
                onClick={() => set("gender", gender)}
              />
            ))}
          </fieldset>
        ) : null}

        {stepKey === "interested_in" ? (
          <fieldset className="flex flex-wrap gap-2">
            <legend className="sr-only">{stepCopy.label}</legend>
            {GENDERS.map((gender) => (
              <ChoiceChip
                key={gender}
                selected={(value("preferredGenders") as string[]).includes(gender)}
                label={t.enums.gender[gender]}
                onClick={() =>
                  set("preferredGenders", toggleIn(value("preferredGenders") as string[], gender))
                }
              />
            ))}
          </fieldset>
        ) : null}

        {stepKey === "intent" ? (
          <fieldset className="flex flex-wrap gap-2">
            <legend className="sr-only">{stepCopy.label}</legend>
            {RELATIONSHIP_INTENTS.map((intent) => (
              <ChoiceChip
                key={intent}
                selected={value("intent") === intent}
                label={t.enums.intent[intent]}
                onClick={() => set("intent", intent)}
              />
            ))}
          </fieldset>
        ) : null}

        {stepKey === "location" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="onboarding-city">{t.profileFields.city}</Label>
              <Input
                id="onboarding-city"
                maxLength={80}
                value={value("city") as string}
                onChange={(event) => set("city", event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="onboarding-country">{t.profileFields.country}</Label>
              <Input
                id="onboarding-country"
                maxLength={80}
                value={value("country") as string}
                onChange={(event) => set("country", event.target.value)}
              />
            </div>
          </div>
        ) : null}

        {stepKey === "interests" ? (
          <fieldset className="flex flex-wrap gap-2">
            <legend className="sr-only">{stepCopy.label}</legend>
            {(interests ?? []).map((interest) => (
              <ChoiceChip
                key={interest.id}
                selected={(value("interestIds") as string[]).includes(interest.id)}
                label={interest.label_en}
                onClick={() =>
                  set("interestIds", toggleIn(value("interestIds") as string[], interest.id))
                }
              />
            ))}
          </fieldset>
        ) : null}

        {stepKey === "lifestyle" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="onboarding-occupation">{t.profileFields.occupation}</Label>
              <Input
                id="onboarding-occupation"
                maxLength={120}
                value={value("occupation") as string}
                onChange={(event) => set("occupation", event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="onboarding-education">{t.profileFields.education}</Label>
              <Input
                id="onboarding-education"
                maxLength={120}
                value={value("education") as string}
                onChange={(event) => set("education", event.target.value)}
              />
            </div>
          </div>
        ) : null}

        {stepKey === "photos" ? <PhotoManager photos={account.photos} /> : null}

        {stepKey === "bio" ? (
          <div className="space-y-1.5">
            <Label htmlFor="onboarding-bio">{t.profileFields.bio}</Label>
            <Textarea
              id="onboarding-bio"
              rows={5}
              maxLength={1000}
              value={value("bio") as string}
              onChange={(event) => set("bio", event.target.value)}
            />
            <p className="text-xs text-muted-foreground">{(value("bio") as string).length}/1000</p>
          </div>
        ) : null}

        {stepKey === "preferences" ? (
          <div className="space-y-4">
            <fieldset className="flex flex-wrap gap-2">
              <legend className="mb-2 text-sm font-medium">{t.profileFields.intents}</legend>
              {RELATIONSHIP_INTENTS.map((intent) => (
                <ChoiceChip
                  key={intent}
                  selected={(value("intents") as string[]).includes(intent)}
                  label={t.enums.intent[intent]}
                  onClick={() => set("intents", toggleIn(value("intents") as string[], intent))}
                />
              ))}
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="onboarding-min-age">{t.profileFields.minAge}</Label>
                <Input
                  id="onboarding-min-age"
                  type="number"
                  min={18}
                  max={120}
                  value={String(value("minAge"))}
                  onChange={(event) => set("minAge", Number(event.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="onboarding-max-age">{t.profileFields.maxAge}</Label>
                <Input
                  id="onboarding-max-age"
                  type="number"
                  min={18}
                  max={120}
                  value={String(value("maxAge"))}
                  onChange={(event) => set("maxAge", Number(event.target.value))}
                />
              </div>
            </div>
          </div>
        ) : null}

        {stepKey === "privacy" ? (
          <PrivacyFields
            value={value("privacy")}
            onChange={(next) => set("privacy", { ...(value("privacy") as object), ...next })}
          />
        ) : null}

        {stepKey === "completion" ? (
          <p className="flex items-center gap-2 text-sm text-foreground">
            <Check aria-hidden="true" className="size-4 text-primary" />
            {stepCopy.body}
          </p>
        ) : null}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          className="min-h-11 rounded-full"
          disabled={stepIndex === 0 || busy}
          onClick={() => {
            setDraft(null);
            setErrorKey(null);
            setStepIndex((index) => Math.max(0, index - 1));
          }}
        >
          {t.onboarding.actions.back}
        </Button>
        <Button className="min-h-11 rounded-full" disabled={busy} onClick={goNext}>
          {busy ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
          {stepIndex === ONBOARDING_STEPS.length - 1
            ? t.onboarding.actions.finish
            : t.onboarding.actions.continue}
        </Button>
        {!step.required && stepIndex < ONBOARDING_STEPS.length - 1 ? (
          <Button
            variant="ghost"
            className="min-h-11 rounded-full"
            disabled={busy}
            onClick={() => {
              setDraft(null);
              setErrorKey(null);
              setStepIndex((index) => index + 1);
            }}
          >
            {t.onboarding.actions.skip}
          </Button>
        ) : null}
      </div>
    </AccountShell>
  );
}

function ChoiceChip({
  selected,
  label,
  onClick,
}: {
  selected: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`min-h-11 rounded-full border px-4 text-sm transition-colors ${
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-foreground hover:border-primary/60"
      }`}
    >
      {label}
    </button>
  );
}

export function PrivacyFields({
  value,
  onChange,
}: {
  value: {
    profile_visibility: (typeof PROFILE_VISIBILITIES)[number];
    allow_messages: (typeof MESSAGE_AUDIENCES)[number];
    discoverable: boolean;
    show_online_status: boolean;
    show_read_receipts: boolean;
  };
  onChange: (next: Partial<typeof value>) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="privacy-visibility">{t.settingsPage.privacy.profileVisibility}</Label>
        <select
          id="privacy-visibility"
          className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
          value={value.profile_visibility}
          onChange={(event) =>
            onChange({
              profile_visibility: event.target.value as (typeof PROFILE_VISIBILITIES)[number],
            })
          }
        >
          {PROFILE_VISIBILITIES.map((option) => (
            <option key={option} value={option}>
              {t.enums.visibility[option]}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="privacy-messages">{t.settingsPage.privacy.allowMessages}</Label>
        <select
          id="privacy-messages"
          className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
          value={value.allow_messages}
          onChange={(event) =>
            onChange({ allow_messages: event.target.value as (typeof MESSAGE_AUDIENCES)[number] })
          }
        >
          {MESSAGE_AUDIENCES.map((option) => (
            <option key={option} value={option}>
              {t.enums.audience[option]}
            </option>
          ))}
        </select>
      </div>

      <ToggleRow
        id="privacy-discoverable"
        label={t.settingsPage.privacy.discoverable}
        checked={value.discoverable}
        onChange={(checked) => onChange({ discoverable: checked })}
      />
      <ToggleRow
        id="privacy-online"
        label={t.settingsPage.privacy.showOnlineStatus}
        checked={value.show_online_status}
        onChange={(checked) => onChange({ show_online_status: checked })}
      />
      <ToggleRow
        id="privacy-receipts"
        label={t.settingsPage.privacy.showReadReceipts}
        checked={value.show_read_receipts}
        onChange={(checked) => onChange({ show_read_receipts: checked })}
      />
    </div>
  );
}

function ToggleRow({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <Label htmlFor={id} className="text-sm font-normal">
        {label}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
