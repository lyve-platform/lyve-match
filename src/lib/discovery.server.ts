/**
 * Server-only discovery helpers. Never imported by browser code.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { ViewerFacts } from "@/lib/discovery-core";
import { calculateAge } from "@/lib/age";

type Client = SupabaseClient<Database>;

/** Signed photo URLs are short-lived; the bucket itself stays private. */
export const PHOTO_URL_TTL_SECONDS = 60 * 30;

/** Loads the viewer's own facts (own rows only — RLS applies as the user). */
export async function loadViewerFacts(supabase: Client, userId: string): Promise<ViewerFacts> {
  const [{ data: profile }, { data: preferences }, { data: interests }] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "date_of_birth, relationship_intent, city, country, smoking, drinking, exercise, children, social_energy, communication_style",
      )
      .eq("id", userId)
      .maybeSingle(),
    supabase.from("preferences").select("min_age, max_age").eq("profile_id", userId).maybeSingle(),
    supabase.from("profile_interests").select("interests(slug)").eq("profile_id", userId),
  ]);

  const slugs = (interests ?? [])
    .map((row) => (row as { interests: { slug: string } | null }).interests?.slug)
    .filter((slug): slug is string => Boolean(slug));

  return {
    age: profile?.date_of_birth ? calculateAge(profile.date_of_birth) : null,
    intent: profile?.relationship_intent ?? null,
    interestSlugs: slugs,
    city: profile?.city ?? null,
    country: profile?.country ?? null,
    minAge: preferences?.min_age ?? 18,
    maxAge: preferences?.max_age ?? 99,
    smoking: profile?.smoking ?? null,
    drinking: profile?.drinking ?? null,
    exercise: profile?.exercise ?? null,
    children: profile?.children ?? null,
    social_energy: profile?.social_energy ?? null,
    communication_style: profile?.communication_style ?? null,
  };
}

/**
 * Mints short-lived signed URLs for photo paths the database already cleared
 * the viewer to see. Returns a path -> url map; unsignable paths are dropped.
 */
export async function signPhotoUrls(paths: string[]): Promise<Record<string, string>> {
  const unique = Array.from(new Set(paths)).filter(Boolean);
  if (unique.length === 0) return {};

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.storage
    .from("profile-photos")
    .createSignedUrls(unique, PHOTO_URL_TTL_SECONDS);
  if (error || !data) return {};

  const map: Record<string, string> = {};
  for (const item of data) {
    if (item.signedUrl && item.path) map[item.path] = item.signedUrl;
  }
  return map;
}

/** Keeps the recency ranking factor honest without exposing precise activity. */
export async function touchLastActive(supabase: Client, userId: string): Promise<void> {
  await supabase.from("profiles").update({ last_active_at: new Date().toISOString() }).eq("id", userId);
}
