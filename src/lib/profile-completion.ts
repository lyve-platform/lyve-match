import type { AccountData } from "@/lib/account";

export type CompletionSectionKey =
  | "basics"
  | "intent"
  | "photo"
  | "bio"
  | "preferences";

export type CompletionResult = {
  percent: number;
  sections: Array<{ key: CompletionSectionKey; done: boolean }>;
};

/**
 * Completion is always derived from real stored data — never a stored or
 * fabricated number.
 */
export function computeCompletion(account: AccountData | undefined): CompletionResult {
  const profile = account?.profile;
  const preferences = account?.preferences;

  const sections: Array<{ key: CompletionSectionKey; done: boolean }> = [
    {
      key: "basics",
      done: Boolean(
        profile?.first_name &&
          profile?.date_of_birth &&
          profile?.gender &&
          profile?.country &&
          profile?.city,
      ),
    },
    { key: "intent", done: Boolean(profile?.relationship_intent) },
    { key: "photo", done: (account?.photos.length ?? 0) > 0 },
    { key: "bio", done: (profile?.bio?.trim().length ?? 0) >= 20 },
    {
      key: "preferences",
      done: Boolean(
        preferences &&
          preferences.preferred_genders.length > 0 &&
          preferences.intents.length > 0,
      ),
    },
  ];

  const done = sections.filter((section) => section.done).length;
  return { percent: Math.round((done / sections.length) * 100), sections };
}
