/**
 * Phone (SMS OTP) verification bound to the signed-in account.
 *
 * The number lives in Supabase Auth (never in a product table) and the app
 * only ever stores/derives a masked hint plus the confirmation timestamp, so
 * no phone number is exposed in the product surface.
 */
import { supabase } from "@/integrations/supabase/client";

export type PhoneVerificationState = {
  verified: boolean;
  /** Masked tail such as "••••1234", or null when unverified. */
  hint: string | null;
  verifiedAt: string | null;
};

export const phoneVerificationKey = (userId: string) => ["phone-verification", userId] as const;

/** Accepts E.164 only: a leading + and 8–15 digits. */
export function normalizePhone(input: string): string | null {
  const trimmed = input.replace(/[\s()-]/g, "");
  return /^\+[1-9]\d{7,14}$/.test(trimmed) ? trimmed : null;
}

export async function fetchPhoneVerification(): Promise<PhoneVerificationState> {
  const { data, error } = await supabase.rpc("sync_phone_verification");
  if (error) throw error;
  const row = (data ?? [])[0];
  return {
    verified: row?.phone_verified === true,
    hint: row?.phone_hint ?? null,
    verifiedAt: row?.verified_at ?? null,
  };
}

/** Sends a one-time code to the number and stages it as a pending change. */
export async function sendPhoneOtp(phone: string): Promise<void> {
  const normalized = normalizePhone(phone);
  if (!normalized) throw new Error("phone: invalid format");
  const { error } = await supabase.auth.updateUser({ phone: normalized });
  if (error) throw error;
}

/** Confirms the code; Auth then marks the phone as confirmed for this user. */
export async function confirmPhoneOtp(phone: string, code: string): Promise<void> {
  const normalized = normalizePhone(phone);
  if (!normalized) throw new Error("phone: invalid format");
  if (!/^\d{4,8}$/.test(code.trim())) throw new Error("phone: invalid code");
  const { error } = await supabase.auth.verifyOtp({
    phone: normalized,
    token: code.trim(),
    type: "phone_change",
  });
  if (error) throw error;
}
