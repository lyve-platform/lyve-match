import type { Dictionary } from "@/i18n/en";

export type AppErrorKey = keyof Dictionary["auth"]["errors"];

/**
 * Maps auth/database failures onto localised, non-technical messages.
 * Raw provider or database errors are never shown to members.
 */
export function toErrorKey(error: unknown): AppErrorKey {
  const message = extractMessage(error).toLowerCase();
  const status = extractStatus(error);

  if (!message && status === undefined) return "generic";

  if (message.includes("underage")) return "underage";
  if (message.includes("invalid_dob")) return "invalidDob";
  if (status === 429 || message.includes("rate limit") || message.includes("too many"))
    return "rateLimited";
  if (message.includes("invalid login credentials") || message.includes("invalid credentials"))
    return "invalidCredentials";
  if (message.includes("email not confirmed")) return "emailNotConfirmed";
  if (
    message.includes("already registered") ||
    message.includes("already been registered") ||
    message.includes("user already exists") ||
    message.includes("duplicate key")
  )
    return "emailTaken";
  if (message.includes("password") && (message.includes("short") || message.includes("weak")))
    return "weakPassword";
  if (message.includes("unable to validate email") || message.includes("invalid email"))
    return "invalidEmail";
  if (message.includes("jwt") || message.includes("session") || status === 401)
    return "sessionExpired";
  if (message.includes("failed to fetch") || message.includes("network")) return "network";
  if (
    message.includes("storage") ||
    message.includes("upload") ||
    message.includes("payload too large")
  )
    return "uploadFailed";
  if (status === 403 || message.includes("row-level security") || message.includes("permission"))
    return "database";
  if (message.includes("violates") || message.includes("constraint")) return "database";

  return "generic";
}

function extractMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const candidate = error as { message?: unknown; error_description?: unknown };
    if (typeof candidate.message === "string") return candidate.message;
    if (typeof candidate.error_description === "string") return candidate.error_description;
  }
  return "";
}

function extractStatus(error: unknown): number | undefined {
  if (error && typeof error === "object") {
    const candidate = error as { status?: unknown };
    if (typeof candidate.status === "number") return candidate.status;
  }
  return undefined;
}
