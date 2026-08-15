import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getLocalizationSetting, setArabicEnabled } from "@/lib/localization.functions";
import { useI18n } from "@/i18n";

export const localizationKeys = { setting: ["admin", "localization"] as const };

export function useLocalizationSetting(enabled: boolean) {
  const fetchSetting = useServerFn(getLocalizationSetting);
  return useQuery({
    queryKey: localizationKeys.setting,
    queryFn: () => fetchSetting(),
    enabled,
    retry: false,
  });
}

export function useSetArabicEnabled() {
  const queryClient = useQueryClient();
  const { refreshAvailability } = useI18n();
  const mutate = useServerFn(setArabicEnabled);
  return useMutation({
    mutationFn: (enabled: boolean) => mutate({ data: { enabled } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: localizationKeys.setting });
      await refreshAvailability();
    },
  });
}
