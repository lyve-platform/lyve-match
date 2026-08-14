import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2, MessageCircle } from "lucide-react";
import { AccountShell } from "@/components/lyve/AccountShell";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { fill } from "@/lib/format";
import { useConversations } from "@/hooks/useMessaging";

const title = "Your conversations on LYVE";
const description = "Private one-to-one conversations with the people you've matched with.";

export const Route = createFileRoute("/_authenticated/messages/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MessagesPage,
});

function MessagesPage() {
  const { t, locale } = useI18n();
  const { data, isLoading, isError, refetch } = useConversations();

  const dayFormatter = new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", {
    day: "numeric",
    month: "short",
  });
  const timeFormatter = new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", {
    hour: "numeric",
    minute: "2-digit",
  });

  function stamp(value: string | null): string {
    if (!value) return "";
    const date = new Date(value);
    const sameDay = new Date().toDateString() === date.toDateString();
    return sameDay ? timeFormatter.format(date) : dayFormatter.format(date);
  }

  return (
    <AccountShell title={t.messaging.title} subtitle={t.messaging.subtitle}>
      {isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" /> {t.messaging.loading}
        </p>
      ) : isError ? (
        <div className="rounded-2xl border border-border/70 bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">{t.messaging.error}</p>
          <Button className="mt-4 rounded-full" onClick={() => void refetch()}>
            {t.messaging.retry}
          </Button>
        </div>
      ) : (data ?? []).length === 0 ? (
        <div className="rounded-2xl border border-border/70 bg-card p-8 text-center">
          <MessageCircle className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-semibold">{t.messaging.emptyTitle}</h2>
          <p className="mx-auto mt-2 max-w-md text-pretty text-sm text-muted-foreground">
            {t.messaging.emptyBody}
          </p>
          <Button asChild className="mt-6 rounded-full">
            <Link to="/discover">{t.messaging.emptyAction}</Link>
          </Button>
        </div>
      ) : (
        <ul className="divide-y divide-border/70 overflow-hidden rounded-2xl border border-border/70 bg-card">
          {(data ?? []).map((conversation) => {
            const name = conversation.firstName ?? "—";
            const preview = conversation.lastMessageDeleted
              ? t.messaging.deletedPreview
              : (conversation.lastMessagePreview ?? t.messaging.noMessagesYet);
            return (
              <li key={conversation.conversationId}>
                <Link
                  to="/messages/$conversationId"
                  params={{ conversationId: conversation.conversationId }}
                  className="flex items-center gap-3 px-4 py-4 transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                >
                  {conversation.photoUrl ? (
                    <img
                      src={conversation.photoUrl}
                      alt={fill(t.messaging.photoAlt, { name })}
                      loading="lazy"
                      className="size-12 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="grid size-12 shrink-0 place-items-center rounded-full bg-muted text-sm font-medium text-muted-foreground"
                    >
                      {name.slice(0, 1)}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-medium">{name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {stamp(conversation.lastMessageAt)}
                      </span>
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-2">
                      <span
                        className={`truncate text-sm ${
                          conversation.unreadCount > 0
                            ? "font-medium text-foreground"
                            : "text-muted-foreground"
                        }`}
                      >
                        {conversation.lastMessageFromMe && !conversation.lastMessageDeleted
                          ? t.messaging.youPrefix
                          : ""}
                        {preview}
                      </span>
                      {conversation.unreadCount > 0 ? (
                        <span className="inline-flex min-w-6 shrink-0 items-center justify-center rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                          <span aria-hidden="true">{conversation.unreadCount}</span>
                          <span className="sr-only">
                            {fill(t.messaging.unreadBadge, { count: conversation.unreadCount })}
                          </span>
                        </span>
                      ) : null}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">{t.messaging.safetyNote}</p>
    </AccountShell>
  );
}
