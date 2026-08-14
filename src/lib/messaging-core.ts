/**
 * Shared messaging types and projections.
 *
 * The browser only ever sees the fields listed here. Everything else the
 * database knows about a conversation — storage paths, moderation state, the
 * other member's email, preferences, coordinates or activity — is dropped at
 * the server boundary.
 */

export const MESSAGE_PAGE_SIZE = 30;
export const MESSAGE_PAGE_MAX = 50;
export const MESSAGE_BODY_MAX = 4000;

export type ConversationSummary = {
  conversationId: string;
  matchId: string;
  otherProfileId: string;
  firstName: string | null;
  age: number | null;
  photoUrl: string | null;
  canSend: boolean;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastMessageFromMe: boolean;
  lastMessageDeleted: boolean;
  unreadCount: number;
  createdAt: string;
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  type: "text";
  body: string | null;
  deletedAt: string | null;
  createdAt: string;
};

export type ConversationHeader = {
  conversationId: string;
  otherProfileId: string;
  firstName: string | null;
  age: number | null;
  city: string | null;
  country: string | null;
  photoUrl: string | null;
  matchId: string;
  canSend: boolean;
  /** Only present when the other member's privacy settings allow it. */
  showOnlineStatus: boolean;
};

export type MessagePage = {
  messages: ChatMessage[];
  /** Cursor for older messages; null when the start of the history is reached. */
  nextCursor: string | null;
  /** When the other member last read the conversation, for the sent/read state. */
  otherLastReadAt: string | null;
  viewerId: string;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  message_type: string;
  body: string | null;
  deleted_at: string | null;
  created_at: string;
};

/** Strict allowlist projection: new database columns never leak by default. */
export function toChatMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    type: "text",
    body: row.deleted_at ? null : row.body,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
  };
}

/** Oldest-first, de-duplicated by id — realtime may deliver the same row twice. */
export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  for (const message of [...current, ...incoming]) byId.set(message.id, message);
  return Array.from(byId.values()).sort((a, b) =>
    a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt.localeCompare(b.createdAt),
  );
}

export function isReadByOther(message: ChatMessage, otherLastReadAt: string | null): boolean {
  if (!otherLastReadAt) return false;
  return new Date(otherLastReadAt).getTime() >= new Date(message.createdAt).getTime();
}
