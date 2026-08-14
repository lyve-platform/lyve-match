/**
 * Centralised backend feature gate.
 *
 * Every Premium capability is authorised HERE, on the server, against the
 * database. Hiding a button is presentation; this is the security boundary.
 * A direct RPC from a Free user, a forged request body, a hand-crafted query
 * string and a devtools-edited React state all arrive at this same check.
 *
 * `has_entitlement` is SECURITY DEFINER and additionally requires the account
 * to be in good standing, so a suspended member loses Premium capability even
 * while a paid subscription exists.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { EntitlementKey } from "@/config/billing";

type Client = SupabaseClient<Database>;

export class EntitlementError extends Error {
  constructor(public readonly key: string) {
    // Stable, safe code. No provider detail, no internal message.
    super("PREMIUM_REQUIRED");
    this.name = "EntitlementError";
  }
}

export async function hasEntitlement(
  supabase: Client,
  userId: string,
  key: EntitlementKey,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("has_entitlement", { _user: userId, _key: key });
  if (error) return false;
  return data === true;
}

/** Throws `PREMIUM_REQUIRED` unless the caller genuinely holds the entitlement. */
export async function requireEntitlement(
  supabase: Client,
  userId: string,
  key: EntitlementKey,
): Promise<void> {
  if (!(await hasEntitlement(supabase, userId, key))) throw new EntitlementError(key);
}
