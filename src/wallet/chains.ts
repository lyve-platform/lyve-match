import { arbitrum, base, bsc, mainnet, type Chain } from "viem/chains";

export type WalletChain = {
  chain: Chain;
  key: string;
  label: string;
  symbol: string;
  rpcUrl: string;
  explorerTx: (hash: string) => string;
  explorerAddress: (address: string) => string;
};

export const WALLET_CHAINS: WalletChain[] = [
  {
    chain: mainnet,
    key: "ethereum",
    label: "Ethereum",
    symbol: "ETH",
    rpcUrl: "https://ethereum-rpc.publicnode.com",
    explorerTx: (h) => `https://etherscan.io/tx/${h}`,
    explorerAddress: (a) => `https://etherscan.io/address/${a}`,
  },
  {
    chain: base,
    key: "base",
    label: "Base",
    symbol: "ETH",
    rpcUrl: "https://base-rpc.publicnode.com",
    explorerTx: (h) => `https://basescan.org/tx/${h}`,
    explorerAddress: (a) => `https://basescan.org/address/${a}`,
  },
  {
    chain: arbitrum,
    key: "arbitrum",
    label: "Arbitrum One",
    symbol: "ETH",
    rpcUrl: "https://arbitrum-one-rpc.publicnode.com",
    explorerTx: (h) => `https://arbiscan.io/tx/${h}`,
    explorerAddress: (a) => `https://arbiscan.io/address/${a}`,
  },
  {
    chain: bsc,
    key: "bsc",
    label: "BNB Smart Chain",
    symbol: "BNB",
    rpcUrl: "https://bsc-rpc.publicnode.com",
    explorerTx: (h) => `https://bscscan.com/tx/${h}`,
    explorerAddress: (a) => `https://bscscan.com/address/${a}`,
  },
];

export const DEFAULT_CHAIN = WALLET_CHAINS[0];

export function getWalletChain(key: string): WalletChain {
  return WALLET_CHAINS.find((c) => c.key === key) ?? DEFAULT_CHAIN;
}
