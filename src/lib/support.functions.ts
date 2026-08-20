/**
 * Support ticket server functions.
 *
 * Every call runs through `requireSupabaseAuth`, so tickets are always written
 * as the signed-in member and read back under row level security.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const SUPPORT_CATEGORIES = ["account", "safety", "billing", "technical", "other"] as const;
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

export type SupportTicket = {
  id: string;
  category: SupportCategory;
  subject: string;
  body: string;
  status: string;
  createdAt: string;
};

export const createSupportTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { category: SupportCategory; subject: string; body: string }) => {
    const category = SUPPORT_CATEGORIES.includes(input?.category) ? input.category : "other";
    const subject = String(input?.subject ?? "")
      .trim()
      .slice(0, 140);
    const body = String(input?.body ?? "")
      .trim()
      .slice(0, 4000);
    if (subject.length < 3) throw new Error("INVALID_SUBJECT");
    if (body.length < 10) throw new Error("INVALID_BODY");
    return { category, subject, body };
  })
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase.from("support_tickets").insert({
      profile_id: context.userId,
      category: data.category,
      subject: data.subject,
      body: data.body,
    });
    if (error) throw error;
    return { ok: true };
  });

export const listMySupportTickets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SupportTicket[]> => {
    const { data, error } = await context.supabase
      .from("support_tickets")
      .select("id, category, subject, body, status, created_at")
      .eq("profile_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: String(row.id),
      category: row.category as SupportCategory,
      subject: String(row.subject),
      body: String(row.body),
      status: String(row.status),
      createdAt: String(row.created_at),
    }));
  });

export type SupportReply = {
  id: string;
  isStaff: boolean;
  body: string;
  createdAt: string;
};

export const listMyTicketReplies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ticketId: string }) => {
    const ticketId = String(input?.ticketId ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(ticketId)) throw new Error("INVALID_TICKET");
    return { ticketId };
  })
  .handler(async ({ data, context }): Promise<SupportReply[]> => {
    const { data: rows, error } = await context.supabase
      .from("support_ticket_replies")
      .select("id, is_staff, body, created_at")
      .eq("ticket_id", data.ticketId)
      .order("created_at", { ascending: true })
      .limit(100);
    if (error) throw error;
    return (rows ?? []).map((row) => ({
      id: String(row.id),
      isStaff: Boolean(row.is_staff),
      body: String(row.body),
      createdAt: String(row.created_at),
    }));
  });

export const replyToMyTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ticketId: string; body: string }) => {
    const ticketId = String(input?.ticketId ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(ticketId)) throw new Error("INVALID_TICKET");
    const body = String(input?.body ?? "")
      .trim()
      .slice(0, 4000);
    if (body.length < 2) throw new Error("INVALID_BODY");
    return { ticketId, body };
  })
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase.from("support_ticket_replies").insert({
      ticket_id: data.ticketId,
      author_id: context.userId,
      is_staff: false,
      body: data.body,
    });
    if (error) throw error;
    return { ok: true };
  });
