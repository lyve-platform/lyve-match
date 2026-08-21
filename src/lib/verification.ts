/**
 * Member-side verification.
 *
 * The selfie is uploaded to the private photo bucket under the member's own
 * folder (storage RLS already scopes writes to `auth.uid()`), then handed to a
 * SECURITY DEFINER routine which is the ONLY way `profiles.verification_status`
 * can move — a member can never mark themselves verified.
 */
import { supabase } from "@/integrations/supabase/client";
import { ACCEPTED_PHOTO_TYPES, MAX_PHOTO_BYTES } from "@/config/lyve";

export type VerificationStatus = "unverified" | "pending" | "verified" | "rejected";

export type MyVerification = {
  status: VerificationStatus;
  submittedAt: string | null;
  note: string | null;
  verifiedAt: string | null;
};

export const verificationQueryKey = (userId: string) => ["verification", userId] as const;

export async function fetchMyVerification(): Promise<MyVerification> {
  const { data, error } = await supabase.rpc("my_verification");
  if (error) throw error;
  const row = (data ?? [])[0];
  return {
    status: (row?.status as VerificationStatus) ?? "unverified",
    submittedAt: row?.submitted_at ?? null,
    note: row?.note ?? null,
    verifiedAt: row?.verified_at ?? null,
  };
}

export async function submitVerificationSelfie(
  userId: string,
  file: File,
): Promise<VerificationStatus> {
  if (!ACCEPTED_PHOTO_TYPES.includes(file.type)) throw new Error("upload: unsupported file type");
  if (file.size > MAX_PHOTO_BYTES) throw new Error("upload: payload too large");

  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${userId}/verification/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("profile-photos")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase.rpc("request_photo_verification", { p_path: path });
  if (error) {
    await supabase.storage.from("profile-photos").remove([path]);
    throw error;
  }
  return (data as VerificationStatus) ?? "pending";
}
