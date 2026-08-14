/**
 * Member-facing account standing and appeals.
 *
 * A member may read their own status and file one appeal. The database decides
 * everything that matters: status columns are scrubbed on self-update, and the
 * appeal trigger rejects appeals from accounts in good standing.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  APPEAL_BODY_MAX,
  APPEAL_BODY_MIN,
  type AccountStatus,
  type AppealStatus,
  type MyAccountStanding,
} from "@/lib/admin-core";

function effective(status: AccountStatus, suspendedUntil: string | null): AccountStatus {
  if (status === "suspended" && suspendedUntil && new Date(suspendedUntil) <= new Date()) {
    return "active";
  }
  return status;
}

export const getMyStanding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyAccountStanding> => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("account_status, suspended_until")
      .eq("id", context.userId)
      .maybeSingle();

    const status = effective(
      (profile?.account_status as AccountStatus) ?? "active",
      profile?.suspended_until ?? null,
    );

    const { data: appeal } = await context.supabase
      .from("account_appeals")
      .select("status, created_at, decision_note")
      .eq("profile_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const pending = appeal?.status === "pending" || appeal?.status === "reviewing";

    return {
      status,
      suspendedUntil: profile?.suspended_until ?? null,
      canAppeal: (status === "restricted" || status === "suspended" || status === "banned") && !pending,
      appeal: appeal
        ? {
            status: appeal.status as AppealStatus,
            createdAt: appeal.created_at,
            decisionNote: appeal.decision_note ?? null,
          }
        : null,
    };
  });

export const submitAppeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { body: string }) => {
    const body = String(input?.body ?? "").trim();
    if (body.length < APPEAL_BODY_MIN) throw new Error("APPEAL_TOO_SHORT");
    return { body: body.slice(0, APPEAL_BODY_MAX) };
  })
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("account_appeals")
      .insert({ profile_id: context.userId, body: data.body });
    if (error) throw error;
    return { ok: true };
  });
