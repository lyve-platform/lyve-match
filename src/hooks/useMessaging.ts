/**
 * Messaging hooks: inbox, paginated thread, realtime updates, typing.
 *
 * Realtime is authorisation-aware by construction — Supabase applies the same
 * RLS policies to `postgres_changes` payloads as to a query, so subscribing to
 * a conversation the member does not belong to yields no events. Typing uses
 * ephemeral broadcast and is never persisted.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  getConversationHeader,
  getConversations,
  getMessages,
  markConversationRead,
  reportMessage,
  sendMessage,
  withdrawMessage,
} from "@/lib/messaging.functions";
import {
  mergeMessages,
  toChatMessage,
  type ChatMessage,
  type ConversationSummary,
} from "@/lib/messaging-core";
import type { ReportCategory } from "@/config/lyve";

export const messagingKeys = {
  conversations: ["messaging", "conversations"] as const,
  header: (id: string) => ["messaging", "header", id] as const,
  thread: (id: string) => ["messaging", "thread", id] as const,
};

export function useConversations() {
  const fetchConversations = useServerFn(getConversations);
  const queryClient = useQueryClient();

  const query = useQuery<ConversationSummary[]>({
    queryKey: messagingKeys.conversations,
    queryFn: () => fetchConversations({ data: undefined }),
    staleTime: 15_000,
  });

  // One inbox-wide subscription keeps unread counts and previews live without
  // polling. RLS decides which rows ever reach this client.
  useEffect(() => {
    const channel = supabase
      .channel("inbox")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
        void queryClient.invalidateQueries({ queryKey: messagingKeys.conversations });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}

export function useConversationHeader(conversationId: string) {
  const fetchHeader = useServerFn(getConversationHeader);
  return useQuery({
    queryKey: messagingKeys.header(conversationId),
    queryFn: () => fetchHeader({ data: { conversationId } }),
    staleTime: 60_000,
  });
}

/** Thread state: newest page on mount, older pages on demand, realtime appends. */
export function useConversationThread(conversationId: string) {
  const fetchMessages = useServerFn(getMessages);
  const markRead = useServerFn(markConversationRead);
  const queryClient = useQueryClient();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [otherLastReadAt, setOtherLastReadAt] = useState<string | null>(null);
  const [viewerId, setViewerId] = useState<string>("");
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const initialised = useRef<string | null>(null);

  const apply = useCallback((incoming: ChatMessage[]) => {
    setMessages((current) => mergeMessages(current, incoming));
  }, []);

  useEffect(() => {
    if (initialised.current === conversationId) return;
    initialised.current = conversationId;
    setMessages([]);
    setLoading(true);

    void (async () => {
      try {
        const page = await fetchMessages({ data: { conversationId } });
        setMessages(page.messages);
        setCursor(page.nextCursor);
        setOtherLastReadAt(page.otherLastReadAt);
        setViewerId(page.viewerId);
        await markRead({ data: { conversationId } });
        void queryClient.invalidateQueries({ queryKey: messagingKeys.conversations });
      } catch (cause) {
        setError(cause as Error);
      } finally {
        setLoading(false);
      }
    })();
  }, [conversationId, fetchMessages, markRead, queryClient]);

  const loadOlder = useCallback(async () => {
    if (!cursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await fetchMessages({ data: { conversationId, before: cursor } });
      apply(page.messages);
      setCursor(page.nextCursor);
    } finally {
      setLoadingOlder(false);
    }
  }, [apply, conversationId, cursor, fetchMessages, loadingOlder]);

  // Realtime: new and withdrawn messages, plus the other member's read state.
  useEffect(() => {
    const channel = supabase
      .channel(`conversation:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown> | null;
          if (!row?.["id"]) return;
          // mergeMessages de-duplicates, so a replayed event is a no-op.
          apply([toChatMessage(row as never)]);
          if (row["sender_id"] !== viewerId) {
            void markRead({ data: { conversationId } });
            void queryClient.invalidateQueries({ queryKey: messagingKeys.conversations });
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "message_reads",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as { reader_id?: string; read_at?: string };
          if (row.reader_id && row.reader_id !== viewerId && row.read_at) {
            setOtherLastReadAt((current) =>
              !current || row.read_at! > current ? row.read_at! : current,
            );
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [apply, conversationId, markRead, queryClient, viewerId]);

  const sendFn = useServerFn(sendMessage);
  const withdrawFn = useServerFn(withdrawMessage);

  const send = useMutation({
    mutationFn: (body: string): Promise<ChatMessage> => sendFn({ data: { conversationId, body } }),
    onSuccess: (message) => {
      apply([message]);
      void queryClient.invalidateQueries({ queryKey: messagingKeys.conversations });
    },
  });

  const withdraw = useMutation({
    mutationFn: (messageId: string) => withdrawFn({ data: { messageId } }),
    onSuccess: (_result, messageId) => {
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId
            ? { ...message, body: null, deletedAt: new Date().toISOString() }
            : message,
        ),
      );
    },
  });

  return {
    messages,
    loading,
    error,
    hasOlder: cursor !== null,
    loadingOlder,
    loadOlder,
    otherLastReadAt,
    viewerId,
    send,
    withdraw,
  };
}

/** Ephemeral typing indicator — broadcast only, never written to the database. */
export function useTyping(conversationId: string, viewerId: string) {
  const [otherTyping, setOtherTyping] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSent = useRef(0);

  useEffect(() => {
    const channel = supabase.channel(`typing:${conversationId}`, {
      config: { broadcast: { self: false } },
    });
    channel
      .on("broadcast", { event: "typing" }, (payload) => {
        const from = (payload["payload"] as { profileId?: string } | undefined)?.profileId;
        if (!from || from === viewerId) return;
        setOtherTyping(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setOtherTyping(false), 4000);
      })
      .subscribe();
    channelRef.current = channel;

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [conversationId, viewerId]);

  const notifyTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastSent.current < 2000) return;
    lastSent.current = now;
    void channelRef.current?.send({
      type: "broadcast",
      event: "typing",
      payload: { profileId: viewerId },
    });
  }, [viewerId]);

  return { otherTyping, notifyTyping };
}

export function useReportMessage() {
  const report = useServerFn(reportMessage);
  return useMutation({
    mutationFn: (input: {
      conversationId: string;
      messageId: string;
      reportedId: string;
      category: ReportCategory;
      description?: string;
    }) => report({ data: input }),
  });
}

export function useUnreadTotal(): number {
  const { data } = useConversations();
  return useMemo(
    () => (data ?? []).reduce((total, conversation) => total + conversation.unreadCount, 0),
    [data],
  );
}
