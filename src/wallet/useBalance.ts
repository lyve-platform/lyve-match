import { useQuery } from "@tanstack/react-query";
import { createPublicClient, formatEther, http } from "viem";
import type { WalletChain } from "./chains";

export function useNativeBalance(address: string | null, chain: WalletChain) {
  return useQuery({
    queryKey: ["wallet-balance", chain.key, address],
    enabled: Boolean(address),
    refetchInterval: 30_000,
    queryFn: async (): Promise<string> => {
      const client = createPublicClient({
        chain: chain.chain,
        transport: http(chain.rpcUrl),
      });
      const balance = await client.getBalance({ address: address as `0x${string}` });
      return formatEther(balance);
    },
  });
}

export function formatBalance(value: string | undefined): string {
  if (!value) return "0";
  const num = Number(value);
  if (!Number.isFinite(num)) return "0";
  if (num === 0) return "0";
  if (num < 0.000001) return "<0.000001";
  return num.toLocaleString("en-US", { maximumFractionDigits: 6 });
}
