import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { storeReadiness } from "@/lib/store-readiness.functions";

export const storeReadinessKeys = { readiness: ["admin", "store-readiness"] as const };

export function useStoreReadiness(enabled: boolean) {
  const fetchReadiness = useServerFn(storeReadiness);
  return useQuery({
    queryKey: storeReadinessKeys.readiness,
    queryFn: () => fetchReadiness(),
    enabled,
    retry: false,
  });
}
