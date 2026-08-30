import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { english, generateMnemonic, mnemonicToAccount, type HDAccount } from "viem/accounts";
import {
  decryptMnemonic,
  encryptMnemonic,
  isValidWordCount,
  normalizeMnemonic,
} from "./crypto";
import { clearVault, loadVault, saveVault, type WalletVault } from "./vault";
import { DEFAULT_CHAIN, type WalletChain } from "./chains";

export type WalletStatus = "loading" | "empty" | "locked" | "unlocked";

type WalletContextValue = {
  status: WalletStatus;
  account: HDAccount | null;
  address: string | null;
  chain: WalletChain;
  setChain: (chain: WalletChain) => void;
  createWallet: (pin: string) => string[];
  importWallet: (mnemonic: string, pin: string) => Promise<void>;
  confirmBackup: () => void;
  unlock: (pin: string) => Promise<boolean>;
  lock: () => void;
  resetWallet: () => void;
  getMnemonic: () => string | null;
};

const WalletContext = createContext<WalletContextValue | null>(null);

const CHAIN_KEY = "lyve.wallet.chain";

export function WalletProvider({ children }: { children: ReactNode }) {
  const [vault, setVault] = useState<WalletVault | null>(null);
  const [status, setStatus] = useState<WalletStatus>("loading");
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [account, setAccount] = useState<HDAccount | null>(null);
  const [pendingBackup, setPendingBackup] = useState<string[] | null>(null);
  const [chain, setChainState] = useState<WalletChain>(DEFAULT_CHAIN);

  useEffect(() => {
    const existing = loadVault();
    setVault(existing);
    setStatus(existing ? "locked" : "empty");
  }, []);

  const setChain = useCallback((next: WalletChain) => {
    setChainState(next);
    try {
      localStorage.setItem(CHAIN_KEY, next.key);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(CHAIN_KEY);
      if (!stored) return;
      import("./chains").then(({ getWalletChain }) => setChainState(getWalletChain(stored)));
    } catch {
      /* ignore */
    }
  }, []);

  const finalize = useCallback(
    async (phrase: string, pin: string): Promise<HDAccount> => {
      const payload = await encryptMnemonic(phrase, pin);
      const acc = mnemonicToAccount(phrase);
      const nextVault: WalletVault = {
        version: 1,
        address: acc.address,
        createdAt: Date.now(),
        payload,
      };
      saveVault(nextVault);
      setVault(nextVault);
      setMnemonic(phrase);
      setAccount(acc);
      setStatus("unlocked");
      return acc;
    },
    [],
  );

  const createWallet = useCallback((pin: string): string[] => {
    const phrase = generateMnemonic(english, 128);
    const words = phrase.split(" ");
    setPendingBackup(words);
    void finalizeDeferred(phrase, pin);
    return words;
    async function finalizeDeferred(p: string, userPin: string) {
      await finalize(p, userPin);
    }
  }, [finalize]);

  const confirmBackup = useCallback(() => {
    setPendingBackup(null);
  }, []);

  const importWallet = useCallback(
    async (rawMnemonic: string, pin: string): Promise<void> => {
      const phrase = normalizeMnemonic(rawMnemonic);
      const words = phrase.split(" ").filter(Boolean);
      const dictionary = new Set<string>(english);
      if (!isValidWordCount(phrase) || words.some((w) => !dictionary.has(w))) {
        throw new Error("invalid_mnemonic");
      }
      await finalize(phrase, pin);
    },
    [finalize],
  );

  const unlock = useCallback(
    async (pin: string): Promise<boolean> => {
      if (!vault) return false;
      try {
        const phrase = await decryptMnemonic(vault.payload, pin);
        const acc = mnemonicToAccount(phrase);
        if (acc.address.toLowerCase() !== vault.address.toLowerCase()) return false;
        setMnemonic(phrase);
        setAccount(acc);
        setStatus("unlocked");
        return true;
      } catch {
        return false;
      }
    },
    [vault],
  );

  const lock = useCallback(() => {
    setMnemonic(null);
    setAccount(null);
    setStatus(vault ? "locked" : "empty");
  }, [vault]);

  const resetWallet = useCallback(() => {
    clearVault();
    setVault(null);
    setMnemonic(null);
    setAccount(null);
    setPendingBackup(null);
    setStatus("empty");
  }, []);

  const getMnemonic = useCallback(() => mnemonic, [mnemonic]);

  const value = useMemo<WalletContextValue>(
    () => ({
      status,
      account,
      address: account?.address ?? vault?.address ?? null,
      chain,
      setChain,
      createWallet,
      importWallet,
      confirmBackup,
      unlock,
      lock,
      resetWallet,
      getMnemonic,
    }),
    [
      status,
      account,
      vault,
      chain,
      setChain,
      createWallet,
      importWallet,
      confirmBackup,
      unlock,
      lock,
      resetWallet,
      getMnemonic,
    ],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}

export type { HDAccount };
