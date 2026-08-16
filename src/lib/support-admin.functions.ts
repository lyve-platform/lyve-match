/**
 * Staff-side support ticket server functions.
 *
 * Authorisation is enforced in the database: every RPC checks the caller's
 * support ticket permissions and writes an audit entry for replies.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const SUPPORT_TICKET_STATUSES = [
  "open",
  "pending_user",
  "resolved",
  "closed",
] as const;
export type SupportTicketStatus = (typeof SUPPORT_TICKET_STATUSES)[number];

export type AdminSupportTicket = {
  id: string;
  profileId: string;
  firstName: string | null;
  category: string;
  subject: string;
  body: string;
  status: SupportTicketStatus;
  replyCount: number;
  lastReplyAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminSupportReply = {
  id: string;
  authorName: string | null;
  isStaff: boolean;
  body: string;
  createdAt: string;
};

const uuid = (value: unknown) => {
  const id = String(value ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("INVALID_ID");
  return id;
};

export const adminListSupportTickets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { status?: string | null; page?: number }) => ({
    status:
      input?.status && SUPPORT_TICKET_STATUSES.includes(input.status as SupportTicketStatus)
        ? (input.status as SupportTicketStatus)
        : null,
    page: Math.min(Math.max(Number(input?.page ?? 0) || 0, 0), 200),
  }))
  .handler(async ({ data, context }): Promise<AdminSupportTicket[]> => {
    const { data: rows, error } = await context.supabase.rpc("admin_list_support_tickets", {
      ...(data.status ? { p_status: data.status } : {}),
      p_limit: 50,
      p_offset: data.page * 50,
    });
    if (error) throw error;
    return ((rows ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row["id"]),
      profileId: String(row["profile_id"]),
      firstName: (row["first_name"] as string | null) ?? null,
      category: String(row["category"]),
      subject: String(row["subject"]),
      body: String(row["body"]),
      status: row["status"] as SupportTicketStatus,
      replyCount: Number(row["reply_count"] ?? 0),
      lastReplyAt: (row["last_reply_at"] as string | null) ?? null,
      createdAt: String(row["created_at"]),
      updatedAt: String(row["updated_at"]),
    }));
  });

export const adminListTicketReplies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ticketId: string }) => ({ ticketId: uuid(input?.ticketId) }))
  .handler(async ({ data, context }): Promise<AdminSupportReply[]> => {
    const { data: rows, error } = await context.supabase.rpc("admin_support_ticket_replies", {
      p_ticket: data.ticketId,
    });
    if (error) throw error;
    return ((rows ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row["id"]),
      authorName: (row["author_name"] as string | null) ?? null,
      isStaff: Boolean(row["is_staff"]),
      body: String(row["body"]),
      createdAt: String(row["created_at"]),
    }));
  });

export const adminReplySupportTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ticketId: string; body?: string; status?: string | null }) => {
    const body = String(input?.body ?? "").trim().slice(0, 4000);
    const status =
      input?.status && SUPPORT_TICKET_STATUSES.includes(input.status as SupportTicketStatus)
        ? (input.status as SupportTicketStatus)
        : null;
    if (!body && !status) throw new Error("NOTHING_TO_DO");
    return { ticketId: uuid(input?.ticketId), body: body || null, status };
  })
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase.rpc("admin_reply_support_ticket", {
      p_ticket: data.ticketId,
      ...(data.body ? { p_body: data.body } : {}),
      ...(data.status ? { p_status: data.status } : {}),
    });
    if (error) throw error;
    return { ok: true };
  });

export const adminDeleteSupportTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ticketId: string }) => ({ ticketId: uuid(input?.ticketId) }))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase.rpc("admin_delete_support_ticket", {
      p_ticket: data.ticketId,
    });
    if (error) throw error;
    return { ok: true };
  });
