import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { MAX_PHOTO_BYTES, ACCEPTED_PHOTO_TYPES, MAX_PHOTOS } from "@/config/lyve";

type Tables = Database["public"]["Tables"];
export type Profile = Tables["profiles"]["Row"];
export type ProfilePhoto = Tables["profile_photos"]["Row"];
export type Preferences = Tables["preferences"]["Row"];
export type PrivacySettings = Tables["privacy_settings"]["Row"];
export type OnboardingProgress = Tables["onboarding_progress"]["Row"];
export type Interest = Tables["interests"]["Row"];
export type DeletionRequest = Tables["account_deletion_requests"]["Row"];

export type AccountData = {
  profile: Profile;
  photos: ProfilePhoto[];
  interestIds: string[];
  preferences: Preferences;
  privacy: PrivacySettings;
  onboarding: OnboardingProgress;
  deletionRequest: DeletionRequest | null;
};

export const accountQueryKey = (userId: string) => ["account", userId] as const;

function unwrap<T>(result: { data: T | null; error: unknown }): T {
  if (result.error) throw result.error;
  if (result.data === null) throw new Error("No data returned");
  return result.data;
}

/**
 * Creates the member's application-level rows the first time they sign in.
 * Auth credentials always stay in the auth system — nothing is duplicated here.
 */
export async function ensureAccountRows(user: {
  id: string;
  user_metadata?: Record<string, unknown>;
}): Promise<void> {
  const metadata = user.user_metadata ?? {};
  const firstName = typeof metadata["first_name"] === "string" ? metadata["first_name"] : null;
  const dateOfBirth =
    typeof metadata["date_of_birth"] === "string" ? metadata["date_of_birth"] : null;

  const { error: profileError } = await supabase.from("profiles").upsert(
    { id: user.id, first_name: firstName, date_of_birth: dateOfBirth },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (profileError) throw profileError;

  const results = await Promise.all([
    supabase
      .from("preferences")
      .upsert({ profile_id: user.id }, { onConflict: "profile_id", ignoreDuplicates: true }),
    supabase
      .from("privacy_settings")
      .upsert({ profile_id: user.id }, { onConflict: "profile_id", ignoreDuplicates: true }),
    supabase
      .from("onboarding_progress")
      .upsert({ profile_id: user.id }, { onConflict: "profile_id", ignoreDuplicates: true }),
  ]);
  const failed = results.find((result) => result.error);
  if (failed?.error) throw failed.error;
}

export async function fetchAccount(userId: string): Promise<AccountData> {
  await ensureAccountRows({ id: userId });

  const [profile, photos, interests, preferences, privacy, onboarding, deletion] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase
        .from("profile_photos")
        .select("*")
        .eq("profile_id", userId)
        .order("display_order", { ascending: true }),
      supabase.from("profile_interests").select("interest_id").eq("profile_id", userId),
      supabase.from("preferences").select("*").eq("profile_id", userId).maybeSingle(),
      supabase.from("privacy_settings").select("*").eq("profile_id", userId).maybeSingle(),
      supabase.from("onboarding_progress").select("*").eq("profile_id", userId).maybeSingle(),
      supabase
        .from("account_deletion_requests")
        .select("*")
        .eq("profile_id", userId)
        .eq("status", "pending")
        .maybeSingle(),
    ]);

  if (deletion.error) throw deletion.error;
  if (interests.error) throw interests.error;
  if (photos.error) throw photos.error;

  return {
    profile: unwrap(profile),
    photos: photos.data ?? [],
    interestIds: (interests.data ?? []).map((row) => row.interest_id),
    preferences: unwrap(preferences),
    privacy: unwrap(privacy),
    onboarding: unwrap(onboarding),
    deletionRequest: deletion.data ?? null,
  };
}

export async function fetchInterests(): Promise<Interest[]> {
  const { data, error } = await supabase
    .from("interests")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function updateProfile(
  userId: string,
  patch: Tables["profiles"]["Update"],
): Promise<void> {
  const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
  if (error) throw error;
}

export async function updatePreferences(
  userId: string,
  patch: Tables["preferences"]["Update"],
): Promise<void> {
  const { error } = await supabase.from("preferences").update(patch).eq("profile_id", userId);
  if (error) throw error;
}

export async function updatePrivacy(
  userId: string,
  patch: Tables["privacy_settings"]["Update"],
): Promise<void> {
  const { error } = await supabase.from("privacy_settings").update(patch).eq("profile_id", userId);
  if (error) throw error;
}

export async function saveOnboardingProgress(
  userId: string,
  patch: Tables["onboarding_progress"]["Update"],
): Promise<void> {
  const { error } = await supabase
    .from("onboarding_progress")
    .update(patch)
    .eq("profile_id", userId);
  if (error) throw error;
}

export async function setInterests(userId: string, interestIds: string[]): Promise<void> {
  const { error: deleteError } = await supabase
    .from("profile_interests")
    .delete()
    .eq("profile_id", userId);
  if (deleteError) throw deleteError;
  if (interestIds.length === 0) return;
  const { error } = await supabase
    .from("profile_interests")
    .insert(interestIds.map((interestId) => ({ profile_id: userId, interest_id: interestId })));
  if (error) throw error;
}

/* ---------------------------------------------------------------- photos */

export async function uploadPhoto(
  userId: string,
  file: File,
  currentCount: number,
): Promise<void> {
  if (currentCount >= MAX_PHOTOS) throw new Error("upload: photo limit reached");
  if (!ACCEPTED_PHOTO_TYPES.includes(file.type)) throw new Error("upload: unsupported file type");
  if (file.size > MAX_PHOTO_BYTES) throw new Error("upload: payload too large");

  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${userId}/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("profile-photos")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) throw uploadError;

  const { error } = await supabase.from("profile_photos").insert({
    profile_id: userId,
    storage_path: path,
    display_order: currentCount,
    is_primary: currentCount === 0,
  });
  if (error) {
    await supabase.storage.from("profile-photos").remove([path]);
    throw error;
  }
}

export async function deletePhoto(photo: ProfilePhoto, remaining: ProfilePhoto[]): Promise<void> {
  const { error } = await supabase.from("profile_photos").delete().eq("id", photo.id);
  if (error) throw error;
  await supabase.storage.from("profile-photos").remove([photo.storage_path]);

  const next = remaining.filter((item) => item.id !== photo.id);
  if (photo.is_primary && next[0]) {
    const { error: primaryError } = await supabase
      .from("profile_photos")
      .update({ is_primary: true })
      .eq("id", next[0].id);
    if (primaryError) throw primaryError;
  }
  await reorderPhotos(next.map((item) => item.id));
}

export async function reorderPhotos(orderedIds: string[]): Promise<void> {
  for (let index = 0; index < orderedIds.length; index += 1) {
    const id = orderedIds[index];
    if (!id) continue;
    const { error } = await supabase
      .from("profile_photos")
      .update({ display_order: index })
      .eq("id", id);
    if (error) throw error;
  }
}

export async function setPrimaryPhoto(photoId: string, photos: ProfilePhoto[]): Promise<void> {
  const currentPrimary = photos.find((photo) => photo.is_primary);
  if (currentPrimary && currentPrimary.id !== photoId) {
    const { error } = await supabase
      .from("profile_photos")
      .update({ is_primary: false })
      .eq("id", currentPrimary.id);
    if (error) throw error;
  }
  const { error } = await supabase
    .from("profile_photos")
    .update({ is_primary: true })
    .eq("id", photoId);
  if (error) throw error;
}

export async function createSignedPhotoUrls(
  photos: ProfilePhoto[],
): Promise<Record<string, string>> {
  if (photos.length === 0) return {};
  const { data, error } = await supabase.storage
    .from("profile-photos")
    .createSignedUrls(photos.map((photo) => photo.storage_path), 60 * 30);
  if (error) throw error;
  const map: Record<string, string> = {};
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) map[item.path] = item.signedUrl;
  }
  return map;
}

/* -------------------------------------------------------------- deletion */

export async function requestAccountDeletion(userId: string, reason: string): Promise<void> {
  const { error } = await supabase.from("account_deletion_requests").insert({
    profile_id: userId,
    reason: reason.trim() ? reason.trim() : null,
  });
  if (error) throw error;

  // Soft-delete: the profile is hidden immediately, records are retained for the
  // grace period so legal, safety and payment retention stays possible.
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", userId);
  if (profileError) throw profileError;

  const { error: privacyError } = await supabase
    .from("privacy_settings")
    .update({ discoverable: false, profile_visibility: "hidden" })
    .eq("profile_id", userId);
  if (privacyError) throw privacyError;
}

export async function cancelAccountDeletion(userId: string, requestId: string): Promise<void> {
  const { error } = await supabase
    .from("account_deletion_requests")
    .update({ status: "cancelled", processed_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("profile_id", userId);
  if (error) throw error;

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ deleted_at: null })
    .eq("id", userId);
  if (profileError) throw profileError;
}
