/**
 * Billing hooks.
 *
 * The client is a viewer of billing state, never an author of it. Every value
 * here originates from an authenticated server function that reads the
 * database; nothing in React state, localStorage, or a query parameter can
 * change what these hooks report or what the backend will allow.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  cancelSubscription,
  createCheckoutSession,
  getBillingSnapshot,
  manageSubscription,
  restoreSubscription,
  resumeSubscription,
} from "@/lib/billing.functions";
import type { EntitlementKey } from "@/config/billing";
import type { BillingSnapshot } from "@/lib/billing-core";

export const billingQueryKey = ["billing", "snapshot"] as const;

export function useBilling() {
  const snapshot = useServerFn(getBillingSnapshot);
  return useQuery<BillingSnapshot>({
    queryKey: billingQueryKey,
    queryFn: () => snapshot({ data: undefined as never }),
    staleTime: 30_000,
  });
}

/** Presentation-only convenience. The backend re-checks on every call. */
export function useEntitlement(key: EntitlementKey): boolean {
  const { data } = useBilling();
  return (data?.entitlements ?? []).some((entitlement) => entitlement.key === key);
}

export function useBillingActions() {
  const queryClient = useQueryClient();
  const checkoutFn = useServerFn(createCheckoutSession);
  const cancelFn = useServerFn(cancelSubscription);
  const resumeFn = useServerFn(resumeSubscription);
  const manageFn = useServerFn(manageSubscription);
  const restoreFn = useServerFn(restoreSubscription);

  const refresh = () => queryClient.invalidateQueries({ queryKey: billingQueryKey });

  return {
    checkout: useMutation({
      mutationFn: (planCode: string) => checkoutFn({ data: { planCode } }),
      onSuccess: refresh,
    }),
    cancel: useMutation({
      mutationFn: () => cancelFn({ data: undefined as never }),
      onSuccess: refresh,
    }),
    resume: useMutation({
      mutationFn: () => resumeFn({ data: undefined as never }),
      onSuccess: refresh,
    }),
    manage: useMutation({ mutationFn: () => manageFn({ data: undefined as never }) }),
    restore: useMutation({
      mutationFn: () => restoreFn({ data: undefined as never }),
      onSuccess: (data) => {
        queryClient.setQueryData(billingQueryKey, data);
      },
    }),
  };
}
