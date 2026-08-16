/**
 * Nickname availability check.
 *
 * The underlying database routine is `SECURITY DEFINER`, so it is no longer
 * callable by signed-out clients. Sign-up still needs the check, so it is
 * proxied here: input is validated and normalised server-side, and only a
 * boolean is ever returned — no profile data is exposed.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const nicknameSchema = z.object({
  nickname: z.string().trim().min(2).max(50),
});

export const checkNicknameAvailable = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => nicknameSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: available, error } = await supabaseAdmin.rpc("nickname_available", {
      _nickname: data.nickname,
    });
    if (error) throw new Error("Nickname check failed");
    return { available: Boolean(available) };
  });
