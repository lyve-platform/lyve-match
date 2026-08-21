import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Loader2, SendHorizontal } from "lucide-react";
import { toast } from "sonner";
import { AccountShell } from "@/components/lyve/AccountShell";
import { MessageBubble } from "@/components/lyve/MessageBubble";
import { SafetyMenu } from "@/components/lyve/SafetyMenu";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/i18n";
import { fill } from "@/lib/format";
import { MESSAGE_BODY_MAX } from "@/lib/messaging-core";
import { useConversationHeader, useConversationThread, useTyping } from "@/hooks/useMessaging";

const title = "Conversation on LYVE";
const description = "A private one-to-one conversation with someone you matched with.";

export const Route = createFileRoute("/_authenticated/messages/$conversationId")({
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
  component: ConversationPage,
});

function ConversationPage() {
  const { conversationId } = Route.useParams();
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const header = useConversationHeader(conversationId);
  const thread = useConversationThread(conversationId);
  const { otherTyping, notifyTyping } = useTyping(conversationId, thread.viewerId);

  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const lastCount = useRef(0);

  // Keep the newest message in view as the conversation grows, but never yank
  // the viewport while the member is reading older history.
  useEffect(() => {
    if (thread.messages.length > lastCount.current) {
      bottomRef.current?.scrollIntoView({ block: "end" });
    }
    lastCount.current = thread.messages.length;
  }, [thread.messages.length]);

  const other = header.data;
  const name = other?.firstName ?? "—";
  const BackIcon = ArrowLeft;

  async function handleSend(event: React.FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || thread.send.isPending) return;
    setDraft("");
    try {
      await thread.send.mutateAsync(body);
    } catch {
      setDraft(body);
      toast.error(t.messaging.sendFailed);
    }
  }

  if (header.isLoading) {
    return (
      <AccountShell title={t.messaging.title} subtitle={t.messaging.subtitle}>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" /> {t.messaging.threadLoading}
        </p>
      </AccountShell>
    );
  }

  if (!other) {
    return (
      <AccountShell title={t.messaging.unavailableTitle} subtitle={t.messaging.unavailableBody}>
        <Button asChild className="rounded-full">
          <Link to="/messages">{t.messaging.back}</Link>
        </Button>
      </AccountShell>
    );
  }

  return (
    <AccountShell title={name} subtitle={[other.city, other.country].filter(Boolean).join(", ")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" className="rounded-full">
          <Link to="/messages">
            <BackIcon aria-hidden="true" /> {t.messaging.back}
          </Link>
        </Button>
        <SafetyMenu
          profileId={other.otherProfileId}
          name={name}
          onDone={() => navigate({ to: "/messages" })}
        />
      </div>

      <section
        aria-label={t.messaging.title}
        className="flex min-h-[50vh] flex-col rounded-2xl border border-border/70 bg-card"
      >
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {thread.hasOlder ? (
            <div className="text-center">
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full"
                onClick={() => void thread.loadOlder()}
                disabled={thread.loadingOlder}
              >
                {thread.loadingOlder ? t.messaging.loadingOlder : t.messaging.loadOlder}
              </Button>
            </div>
          ) : null}

          {thread.loading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />{" "}
              {t.messaging.threadLoading}
            </p>
          ) : thread.messages.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t.messaging.threadEmpty}
            </p>
          ) : (
            <ul aria-live="polite" className="space-y-3">
              {thread.messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  mine={message.senderId === thread.viewerId}
                  otherName={name}
                  otherProfileId={other.otherProfileId}
                  otherLastReadAt={thread.otherLastReadAt}
                  onWithdraw={(messageId) => thread.withdraw.mutateAsync(messageId)}
                />
              ))}
            </ul>
          )}
          <div ref={bottomRef} />
        </div>

        <div aria-live="polite" className="min-h-6 px-4 text-xs text-muted-foreground">
          {otherTyping ? fill(t.messaging.typing, { name }) : ""}
        </div>

        {other.canSend ? (
          <form
            onSubmit={handleSend}
            className="flex items-end gap-2 border-t border-border/70 p-3"
          >
            <Label htmlFor="composer" className="sr-only">
              {t.messaging.composerLabel}
            </Label>
            <Textarea
              id="composer"
              value={draft}
              rows={1}
              maxLength={MESSAGE_BODY_MAX}
              placeholder={t.messaging.composerPlaceholder}
              className="max-h-40 min-h-11 resize-y"
              onChange={(event) => {
                setDraft(event.target.value);
                notifyTyping();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleSend(event);
                }
              }}
            />
            <Button
              type="submit"
              size="icon"
              className="size-11 shrink-0 rounded-full"
              disabled={draft.trim().length === 0 || thread.send.isPending}
              aria-label={thread.send.isPending ? t.messaging.sending : t.messaging.send}
            >
              {thread.send.isPending ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <SendHorizontal aria-hidden="true" className="rtl:-scale-x-100" />
              )}
            </Button>
          </form>
        ) : (
          <div className="border-t border-border/70 p-4 text-center">
            <h2 className="text-sm font-semibold">{t.messaging.closedTitle}</h2>
            <p className="mx-auto mt-1 max-w-md text-pretty text-xs text-muted-foreground">
              {t.messaging.closedBody}
            </p>
          </div>
        )}
      </section>

      <p className="text-xs text-muted-foreground">{t.messaging.safetyNote}</p>
    </AccountShell>
  );
}
