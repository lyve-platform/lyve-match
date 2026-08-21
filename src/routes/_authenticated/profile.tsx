import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { AccountShell } from "@/components/lyve/AccountShell";
import { ProfileCompletion } from "@/components/lyve/ProfileCompletion";
import { PhotoManager } from "@/components/lyve/PhotoManager";
import { VerificationCard } from "@/components/lyve/VerificationCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/i18n";
import { useAuth } from "@/auth/AuthProvider";
import { useNicknameAvailability } from "@/hooks/useNicknameAvailability";
import { NicknameHint } from "@/components/lyve/NicknameHint";
import { useAccount, useInterests } from "@/hooks/useAccount";
import { accountQueryKey, setInterests, updatePreferences, updateProfile } from "@/lib/account";
import {
  GENDERS,
  RELATIONSHIP_INTENTS,
  SMOKING_OPTIONS,
  DRINKING_OPTIONS,
  EXERCISE_OPTIONS,
  CHILDREN_OPTIONS,
  SOCIAL_ENERGY_OPTIONS,
  COMMUNICATION_OPTIONS,
  MIN_DISTANCE_KM,
  MAX_DISTANCE_KM,
  type Gender,
  type RelationshipIntent,
} from "@/config/lyve";
import { LifestyleFields, type LifestyleForm } from "@/components/lyve/LifestyleFields";
import { ApproximateLocation } from "@/components/lyve/ApproximateLocation";
import { calculateAge } from "@/lib/age";
import { toErrorKey, type AppErrorKey } from "@/lib/auth-errors";

const title = "Your LYVE profile";
const description = "Manage your LYVE profile, photos, interests, and matching preferences.";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProfilePage,
});

type Form = {
  first_name: string;
  gender: Gender | null;
  relationship_intent: RelationshipIntent | null;
  city: string;
  country: string;
  occupation: string;
  education: string;
  bio: string;
  interestIds: string[];
  preferredGenders: Gender[];
  intents: RelationshipIntent[];
  minAge: number;
  maxAge: number;
  maxDistanceKm: number;
} & LifestyleForm;

function ProfilePage() {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: account, isLoading } = useAccount();
  const { data: interests } = useInterests();

  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorKey, setErrorKey] = useState<AppErrorKey | null>(null);

  useEffect(() => {
    if (!account) return;
    setForm({
      first_name: account.profile.first_name ?? "",
      gender: account.profile.gender,
      relationship_intent: account.profile.relationship_intent,
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
      maxDistanceKm: account.preferences.max_distance_km,
      smoking: account.profile.smoking,
      drinking: account.profile.drinking,
      exercise: account.profile.exercise,
      children: account.profile.children,
      social_energy: account.profile.social_energy,
      communication_style: account.profile.communication_style,
    });
  }, [account]);

  const nicknameStatus = useNicknameAvailability(
    form?.first_name ?? "",
    account?.profile.first_name ?? null,
  );

  if (isLoading || !account || !form || !user) {
    return (
      <AccountShell title={t.profilePage.title} subtitle={t.profilePage.subtitle}>
        <p className="text-sm text-muted-foreground">{t.auth.notices.loading}</p>
      </AccountShell>
    );
  }

  const update = (patch: Partial<Form>) => {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
    setSaved(false);
  };

  const toggle = <T,>(list: T[], item: T): T[] =>
    list.includes(item) ? list.filter((value) => value !== item) : [...list, item];

  async function handleSave() {
    if (!user || !form) return;
    if (nicknameStatus === "taken" || nicknameStatus === "checking") return;
    setBusy(true);
    setErrorKey(null);
    try {
      await updateProfile(user.id, {
        first_name: form.first_name.trim() || null,
        gender: form.gender,
        relationship_intent: form.relationship_intent,
        city: form.city.trim() || null,
        country: form.country.trim() || null,
        occupation: form.occupation.trim() || null,
        education: form.education.trim() || null,
        bio: form.bio.trim() || null,
        smoking: form.smoking,
        drinking: form.drinking,
        exercise: form.exercise,
        children: form.children,
        social_energy: form.social_energy,
        communication_style: form.communication_style,
      });
      await updatePreferences(user.id, {
        preferred_genders: form.preferredGenders,
        intents: form.intents,
        min_age: form.minAge,
        max_age: form.maxAge,
        max_distance_km: form.maxDistanceKm,
      });
      await setInterests(user.id, form.interestIds);
      await queryClient.invalidateQueries({ queryKey: accountQueryKey(user.id) });
      setSaved(true);
    } catch (error) {
      setErrorKey(toErrorKey(error));
    } finally {
      setBusy(false);
    }
  }

  const age = account.profile.date_of_birth ? calculateAge(account.profile.date_of_birth) : null;

  return (
    <AccountShell title={t.profilePage.title} subtitle={t.profilePage.subtitle}>
      <ProfileCompletion account={account} />

      <VerificationCard />

      {!account.onboarding.is_complete ? (
        <Button asChild variant="outline" className="min-h-11 rounded-full">
          <Link to="/onboarding">{t.profilePage.continueOnboarding}</Link>
        </Button>
      ) : null}

      <section aria-labelledby="basics-heading" className="surface-panel space-y-4 p-5">
        <h2 id="basics-heading" className="text-base font-semibold">
          {t.profilePage.sections.basics}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="profile-name">{t.auth.fields.firstName}</Label>
            <Input
              id="profile-name"
              maxLength={60}
              value={form.first_name}
              onChange={(event) => update({ first_name: event.target.value })}
              aria-invalid={nicknameStatus === "taken"}
            />
            <NicknameHint status={nicknameStatus} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-age">{t.profileFields.age}</Label>
            <Input
              id="profile-age"
              value={age ? String(age) : t.profilePage.notSet}
              readOnly
              disabled
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-city">{t.profileFields.city}</Label>
            <Input
              id="profile-city"
              maxLength={80}
              value={form.city}
              onChange={(event) => update({ city: event.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-country">{t.profileFields.country}</Label>
            <Input
              id="profile-country"
              maxLength={80}
              value={form.country}
              onChange={(event) => update({ country: event.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-occupation">{t.profileFields.occupation}</Label>
            <Input
              id="profile-occupation"
              maxLength={120}
              value={form.occupation}
              onChange={(event) => update({ occupation: event.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-education">{t.profileFields.education}</Label>
            <Input
              id="profile-education"
              maxLength={120}
              value={form.education}
              onChange={(event) => update({ education: event.target.value })}
            />
          </div>
        </div>

        <fieldset className="flex flex-wrap gap-2">
          <legend className="mb-2 text-sm font-medium">{t.profileFields.gender}</legend>
          {GENDERS.map((gender) => (
            <Chip
              key={gender}
              selected={form.gender === gender}
              label={t.enums.gender[gender]}
              onClick={() => update({ gender })}
            />
          ))}
        </fieldset>

        <fieldset className="flex flex-wrap gap-2">
          <legend className="mb-2 text-sm font-medium">{t.profileFields.intent}</legend>
          {RELATIONSHIP_INTENTS.map((intent) => (
            <Chip
              key={intent}
              selected={form.relationship_intent === intent}
              label={t.enums.intent[intent]}
              onClick={() => update({ relationship_intent: intent })}
            />
          ))}
        </fieldset>
      </section>

      <section aria-labelledby="about-heading" className="surface-panel space-y-3 p-5">
        <h2 id="about-heading" className="text-base font-semibold">
          {t.profilePage.sections.about}
        </h2>
        <Label htmlFor="profile-bio" className="sr-only">
          {t.profileFields.bio}
        </Label>
        <Textarea
          id="profile-bio"
          rows={5}
          maxLength={1000}
          value={form.bio}
          onChange={(event) => update({ bio: event.target.value })}
        />
        <p className="text-xs text-muted-foreground">{form.bio.length}/1000</p>
      </section>

      <section aria-labelledby="interests-heading" className="surface-panel space-y-3 p-5">
        <h2 id="interests-heading" className="text-base font-semibold">
          {t.profilePage.sections.interests}
        </h2>
        <div className="flex flex-wrap gap-2">
          {(interests ?? []).map((interest) => (
            <Chip
              key={interest.id}
              selected={form.interestIds.includes(interest.id)}
              label={interest.label_en}
              onClick={() => update({ interestIds: toggle(form.interestIds, interest.id) })}
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="photos-heading" className="surface-panel space-y-3 p-5">
        <h2 id="photos-heading" className="text-base font-semibold">
          {t.profilePage.sections.photos}
        </h2>
        <PhotoManager photos={account.photos} />
      </section>

      <section aria-labelledby="prefs-heading" className="surface-panel space-y-4 p-5">
        <h2 id="prefs-heading" className="text-base font-semibold">
          {t.profilePage.sections.preferences}
        </h2>
        <fieldset className="flex flex-wrap gap-2">
          <legend className="mb-2 text-sm font-medium">{t.profileFields.interestedIn}</legend>
          {GENDERS.map((gender) => (
            <Chip
              key={gender}
              selected={form.preferredGenders.includes(gender)}
              label={t.enums.gender[gender]}
              onClick={() => update({ preferredGenders: toggle(form.preferredGenders, gender) })}
            />
          ))}
        </fieldset>
        <fieldset className="flex flex-wrap gap-2">
          <legend className="mb-2 text-sm font-medium">{t.profileFields.intents}</legend>
          {RELATIONSHIP_INTENTS.map((intent) => (
            <Chip
              key={intent}
              selected={form.intents.includes(intent)}
              label={t.enums.intent[intent]}
              onClick={() => update({ intents: toggle(form.intents, intent) })}
            />
          ))}
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="profile-min-age">{t.profileFields.minAge}</Label>
            <Input
              id="profile-min-age"
              type="number"
              min={18}
              max={120}
              value={String(form.minAge)}
              onChange={(event) => update({ minAge: Number(event.target.value) })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-max-age">{t.profileFields.maxAge}</Label>
            <Input
              id="profile-max-age"
              type="number"
              min={18}
              max={120}
              value={String(form.maxAge)}
              onChange={(event) => update({ maxAge: Number(event.target.value) })}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="profile-distance">{t.lifestyleFields.distance}</Label>
            <Input
              id="profile-distance"
              type="number"
              min={MIN_DISTANCE_KM}
              max={MAX_DISTANCE_KM}
              value={String(form.maxDistanceKm)}
              onChange={(event) => update({ maxDistanceKm: Number(event.target.value) })}
            />
            <p className="text-xs text-muted-foreground">{t.lifestyleFields.distanceHint}</p>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <h3 className="text-sm font-medium">{t.locationField.title}</h3>
            <ApproximateLocation hasLocation={account.profile.approx_latitude !== null} />
          </div>
        </div>
      </section>

      <section aria-labelledby="lifestyle-heading" className="surface-panel space-y-4 p-5">
        <h2 id="lifestyle-heading" className="text-base font-semibold">
          {t.lifestyleFields.sectionTitle}
        </h2>
        <p className="text-sm text-muted-foreground">{t.lifestyleFields.sectionHint}</p>
        <LifestyleFields value={form} onChange={(patch) => update(patch)} />
      </section>

      {errorKey ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm"
        >
          {t.auth.errors[errorKey]}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t.profilePage.saved}
        </p>
      ) : null}

      <Button className="min-h-11 rounded-full" disabled={busy} onClick={handleSave}>
        {busy ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
        {busy ? t.profilePage.saving : t.profilePage.save}
      </Button>
    </AccountShell>
  );
}

function Chip({
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
