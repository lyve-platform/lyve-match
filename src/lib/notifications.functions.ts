/**
 * In-app notifications for the signed-in member.
 *
 * Rows are written only by database triggers (staff replies and support
 * ticket status changes). RLS scopes every read and update to the owner.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AppNotification = {
  id: string;
  kind: "support_reply" | "support_status";
  ticketId: string | null;
  title: string;
  detail: string | null;
  readAt: string | null;
  createdAt: string;
};

export const listMyNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AppNotification[]> => {
    const { data, error } = await context.supabase
      .from("notifications")
      .select("id, kind, ticket_id, title, detail, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: String(row.id),
      kind: row.kind as AppNotification["kind"],
      ticketId: (row.ticket_id as string | null) ?? null,
      title: String(row.title),
      detail: (row.detail as string | null) ?? null,
      readAt: (row.read_at as string | null) ?? null,
      createdAt: String(row.created_at),
    }));
  });

export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .is("read_at", null)
      .eq("profile_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });
