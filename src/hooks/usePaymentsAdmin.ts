import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPaymentsSetting, setPaymentsEnabled } from "@/lib/billing-settings.functions";

export const paymentsSettingKeys = { setting: ["admin", "payments-setting"] as const };

export function usePaymentsSetting(enabled: boolean) {
  const fetchSetting = useServerFn(getPaymentsSetting);
  return useQuery({
    queryKey: paymentsSettingKeys.setting,
    queryFn: () => fetchSetting(),
    enabled,
    retry: false,
  });
}

export function useSetPaymentsEnabled() {
  const queryClient = useQueryClient();
  const mutate = useServerFn(setPaymentsEnabled);
  return useMutation({
    mutationFn: (enabled: boolean) => mutate({ data: { enabled } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: paymentsSettingKeys.setting });
      await queryClient.invalidateQueries({ queryKey: ["billing"] });
    },
  });
}
