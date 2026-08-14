/**
 * Messaging server functions.
 *
 * Authorisation lives in the database: `my_conversations` derives the viewer
 * from the session, and every read/write below runs through the member's own
 * RLS context. Nothing here decides who may talk to whom — it only projects
 * safe fields, signs short-lived photo URLs, and clamps pagination.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { signPhotoUrls } from "@/lib/discovery.server";
import { loadConversationHeader, recordModerationHints } from "@/lib/messaging.server";
import {
  MESSAGE_BODY_MAX,
  MESSAGE_PAGE_MAX,
  MESSAGE_PAGE_SIZE,
  toChatMessage,
  type ChatMessage,
  type ConversationHeader,
  type ConversationSummary,
  type MessagePage,
} from "@/lib/messaging-core";
import { REPORT_CATEGORIES, type ReportCategory } from "@/config/lyve";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireUuid(value: unknown): string {
  const id = String(value ?? "");
  if (!UUID.test(id)) throw new Error("INVALID_ID");
  return id;
}

export const getConversations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ConversationSummary[]> => {
    const { data, error } = await context.supabase.rpc("my_conversations");
    if (error) throw error;

    const rows = (data ?? []) as unknown as Array<{
      conversation_id: string;
      match_id: string;
      other_profile_id: string;
      first_name: string | null;
      age: number | null;
      photo_path: string | null;
      can_send: boolean;
      last_message_at: string | null;
      last_message_preview: string | null;
      last_message_sender_id: string | null;
      last_message_deleted: boolean | null;
      unread_count: number | null;
      created_at: string;
    }>;

    const urls = await signPhotoUrls(rows.flatMap((row) => (row.photo_path ? [row.photo_path] : [])));

    return rows.map((row) => ({
      conversationId: row.conversation_id,
      matchId: row.match_id,
      otherProfileId: row.other_profile_id,
      firstName: row.first_name,
      age: row.age,
      photoUrl: row.photo_path ? (urls[row.photo_path] ?? null) : null,
      canSend: Boolean(row.can_send),
      lastMessageAt: row.last_message_at,
      lastMessagePreview: row.last_message_preview,
      lastMessageFromMe: row.last_message_sender_id === context.userId,
      lastMessageDeleted: Boolean(row.last_message_deleted),
      unreadCount: row.unread_count ?? 0,
      createdAt: row.created_at,
    }));
  });

export const getConversationHeader = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { conversationId: string }) => ({
    conversationId: requireUuid(input?.conversationId),
  }))
  .handler(async ({ data, context }): Promise<ConversationHeader | null> => {
    const header = await loadConversationHeader(context.supabase, data.conversationId, context.userId);
    if (!header) return null;

    const urls = header.photoPath ? await signPhotoUrls([header.photoPath]) : {};
    return {
      conversationId: data.conversationId,
      otherProfileId: header.otherProfileId,
      matchId: header.matchId,
      firstName: header.firstName,
      age: header.age,
      city: header.city,
      country: header.country,
      photoUrl: header.photoPath ? (urls[header.photoPath] ?? null) : null,
      canSend: header.canSend,
      showOnlineStatus: header.showOnlineStatus,
    };
  });

/** Keyset pagination: newest page first, `before` walks backwards in time. */
export const getMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { conversationId: string; before?: string | null; limit?: number }) => ({
    conversationId: requireUuid(input?.conversationId),
    before: input?.before ? String(input.before) : null,
    limit: Math.min(
      Math.max(Math.trunc(Number(input?.limit ?? MESSAGE_PAGE_SIZE)) || MESSAGE_PAGE_SIZE, 1),
      MESSAGE_PAGE_MAX,
    ),
  }))
  .handler(async ({ data, context }): Promise<MessagePage> => {
    const { supabase, userId } = context;

    let query = supabase
      .from("messages")
      .select("id, conversation_id, sender_id, message_type, body, deleted_at, created_at")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(data.limit + 1);

    if (data.before) query = query.lt("created_at", data.before);

    const { data: rows, error } = await query;
    if (error) throw error;

    const page = rows ?? [];
    const hasMore = page.length > data.limit;
    const slice = hasMore ? page.slice(0, data.limit) : page;

    const { data: members } = await supabase
      .from("conversation_members")
      .select("profile_id, last_read_at")
      .eq("conversation_id", data.conversationId);

    const other = (members ?? []).find((row) => row.profile_id !== userId);

    return {
      messages: slice.map(toChatMessage).reverse(),
      nextCursor: hasMore ? (slice[slice.length - 1]?.created_at ?? null) : null,
      otherLastReadAt: other?.last_read_at ?? null,
      viewerId: userId,
    };
  });

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { conversationId: string; body: string }) => {
    const body = String(input?.body ?? "").trim();
    if (body.length === 0) throw new Error("EMPTY_MESSAGE");
    return { conversationId: requireUuid(input?.conversationId), body: body.slice(0, MESSAGE_BODY_MAX) };
  })
  .handler(async ({ data, context }): Promise<ChatMessage> => {
    // sender_id, timestamps and moderation state are stamped by the database
    // trigger; the insert is rejected outright unless the match is still live.
    const { data: row, error } = await context.supabase
      .from("messages")
      .insert({
        conversation_id: data.conversationId,
        sender_id: context.userId,
        message_type: "text",
        body: data.body,
      })
      .select("id, conversation_id, sender_id, message_type, body, deleted_at, created_at")
      .single();
    if (error) throw error;

    await recordModerationHints(row.id, data.body);
    return toChatMessage(row);
  });

export const markConversationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { conversationId: string }) => ({
    conversationId: requireUuid(input?.conversationId),
  }))
  .handler(async ({ data, context }): Promise<{ marked: number }> => {
    const { data: marked, error } = await context.supabase.rpc("mark_conversation_read", {
      p_conversation: data.conversationId,
    });
    if (error) throw error;
    return { marked: Number(marked ?? 0) };
  });

export const withdrawMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { messageId: string }) => ({ messageId: requireUuid(input?.messageId) }))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("messages")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", data.messageId)
      .eq("sender_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

export const reportMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      conversationId: string;
      messageId: string;
      reportedId: string;
      category: ReportCategory;
      description?: string;
    }) => {
      if (!REPORT_CATEGORIES.includes(input?.category)) throw new Error("INVALID_CATEGORY");
      return {
        conversationId: requireUuid(input?.conversationId),
        messageId: requireUuid(input?.messageId),
        reportedId: requireUuid(input?.reportedId),
        category: input.category,
        description: input?.description ? String(input.description).slice(0, 1000) : null,
      };
    },
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase.from("message_reports").insert({
      reporter_id: context.userId,
      reported_id: data.reportedId,
      message_id: data.messageId,
      conversation_id: data.conversationId,
      category: data.category,
      description: data.description,
      status: "open",
    });
    if (error) throw error;
    return { ok: true };
  });
