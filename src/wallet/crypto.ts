/**
 * PIN-based encryption for the wallet recovery phrase.
 * PBKDF2-SHA256 (250k rounds) derives an AES-GCM-256 key.
 * The mnemonic and the derived key never leave the device.
 */

const PBKDF2_ITERATIONS = 250_000;
const KEY_LENGTH = 256;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pin.normalize("NFKC")),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"],
  );
}

export type EncryptedPayload = {
  salt: string;
  iv: string;
  data: string;
  iterations: number;
};

export async function encryptMnemonic(
  mnemonic: string,
  pin: string,
): Promise<EncryptedPayload> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pin, salt);
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    encoder.encode(mnemonic),
  );
  return {
    salt: toBase64(salt),
    iv: toBase64(iv),
    data: toBase64(new Uint8Array(cipher)),
    iterations: PBKDF2_ITERATIONS,
  };
}

export async function decryptMnemonic(
  payload: EncryptedPayload,
  pin: string,
): Promise<string> {
  const salt = fromBase64(payload.salt);
  const iv = fromBase64(payload.iv);
  const data = fromBase64(payload.data);
  const key = await deriveKey(pin, salt);
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      data as BufferSource,
    );
    return decoder.decode(plain);
  } catch {
    throw new Error("wrong_pin");
  }
}

export function isValidPin(pin: string): boolean {
  return /^\d{6}$/.test(pin);
}

export function normalizeMnemonic(input: string): string {
  return input.trim().toLowerCase().split(/\s+/).join(" ");
}

export function isValidWordCount(mnemonic: string): boolean {
  const count = mnemonic.split(" ").filter(Boolean).length;
  return count === 12 || count === 24;
}
