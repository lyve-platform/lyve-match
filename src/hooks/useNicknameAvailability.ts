import { useEffect, useState } from "react";
import { checkNicknameAvailable } from "@/lib/nickname.functions";
import { firstNameSchema, isValid } from "@/lib/validation";

export type NicknameStatus = "idle" | "invalid" | "checking" | "available" | "taken" | "error";

/**
 * Debounced, automatic check that a nickname is not already used by another
 * active member. The database function ignores the caller's own profile, so
 * keeping an existing nickname never reports a conflict.
 */
export function useNicknameAvailability(nickname: string, initial?: string | null): NicknameStatus {
  const [status, setStatus] = useState<NicknameStatus>("idle");

  useEffect(() => {
    const value = nickname.trim();
    if (!value) return setStatus("idle");
    if (!isValid(firstNameSchema, value)) return setStatus("invalid");
    if (initial && value.toLowerCase() === initial.trim().toLowerCase()) return setStatus("idle");

    let cancelled = false;
    setStatus("checking");
    const timer = window.setTimeout(async () => {
      const { data, error } = await supabase.rpc("nickname_available", { _nickname: value });
      if (cancelled) return;
      if (error) return setStatus("error");
      setStatus(data ? "available" : "taken");
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [nickname, initial]);

  return status;
}
