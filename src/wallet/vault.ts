import type { EncryptedPayload } from "./crypto";

/**
 * Encrypted vault persistence. Only the ciphertext, KDF parameters and the
 * public address are stored — never the mnemonic or the PIN.
 */

const STORAGE_KEY = "lyve.wallet.vault.v1";

export type WalletVault = {
  version: 1;
  address: string;
  createdAt: number;
  payload: EncryptedPayload;
};

export function saveVault(vault: WalletVault): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(vault));
}

export function loadVault(): WalletVault | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WalletVault;
    if (parsed.version !== 1 || !parsed.payload || !parsed.address) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearVault(): void {
  localStorage.removeItem(STORAGE_KEY);
}
