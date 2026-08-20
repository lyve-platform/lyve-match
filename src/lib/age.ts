import { MAX_AGE, MIN_AGE } from "@/config/lyve";

export type DateParts = { day: string; month: string; year: string };

/** Returns an ISO yyyy-mm-dd string when the parts form a real calendar date. */
export function toIsoDate(parts: DateParts): string | null {
  const day = Number(parts.day);
  const month = Number(parts.month);
  const year = Number(parts.year);
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return null;
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Age in whole years, calculated from the date of birth — never user-entered. */
export function calculateAge(isoDate: string, now: Date = new Date()): number | null {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return null;
  let age = now.getUTCFullYear() - year;
  const beforeBirthday =
    now.getUTCMonth() + 1 < month || (now.getUTCMonth() + 1 === month && now.getUTCDate() < day);
  if (beforeBirthday) age -= 1;
  return age;
}

export type DobCheck = "ok" | "invalid" | "underage";

export function checkDateOfBirth(isoDate: string | null): DobCheck {
  if (!isoDate) return "invalid";
  const age = calculateAge(isoDate);
  if (age === null || age > MAX_AGE) return "invalid";
  if (age < MIN_AGE) return "underage";
  return "ok";
}

export function splitIsoDate(isoDate: string | null | undefined): DateParts {
  if (!isoDate) return { day: "", month: "", year: "" };
  const [year = "", month = "", day = ""] = isoDate.split("-");
  return { day: String(Number(day) || ""), month: String(Number(month) || ""), year };
}
