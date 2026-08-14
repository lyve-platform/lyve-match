import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import { accountQueryKey, fetchAccount, fetchInterests } from "@/lib/account";

export function useAccount() {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: accountQueryKey(userId ?? "anonymous"),
    queryFn: () => fetchAccount(userId as string),
    enabled: Boolean(userId),
    staleTime: 30_000,
  });
}

export function useInterests() {
  return useQuery({
    queryKey: ["interests"],
    queryFn: fetchInterests,
    staleTime: 5 * 60_000,
  });
}
