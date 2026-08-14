import { z } from "zod";
import { MAX_AGE, MIN_AGE } from "@/config/lyve";

export const emailSchema = z.string().trim().min(1).max(255).email();

/** At least 8 characters, containing a letter and a number. */
export const passwordSchema = z
  .string()
  .min(8)
  .max(128)
  .refine((value) => /[A-Za-z\u0600-\u06FF]/.test(value) && /\d/.test(value));

export const firstNameSchema = z.string().trim().min(1).max(60);
export const bioSchema = z.string().trim().max(1000);
export const shortTextSchema = z.string().trim().max(120);
export const placeSchema = z.string().trim().max(80);
export const reasonSchema = z.string().trim().max(500);

export const ageRangeSchema = z
  .object({
    min_age: z.number().int().min(MIN_AGE).max(MAX_AGE),
    max_age: z.number().int().min(MIN_AGE).max(MAX_AGE),
  })
  .refine((value) => value.max_age >= value.min_age);

export function isValid<T>(schema: z.ZodType<T>, value: unknown): boolean {
  return schema.safeParse(value).success;
}
