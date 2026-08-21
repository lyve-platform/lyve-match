import { useCallback } from "react";
import { useI18n } from "@/i18n";
import { useInterests } from "@/hooks/useAccount";

/** Maps an interest slug to its localized label, falling back to the slug. */
export function useInterestLabel() {
  const { data } = useInterests();

  return useCallback(
    (slug: string) => {
      const match = (data ?? []).find((interest) => interest.slug === slug);
      if (!match) return slug.replace(/_/g, " ");
      return match.label_en;
    },
    [data],
  );
}
