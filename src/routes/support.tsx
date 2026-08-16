import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useI18n } from "@/i18n";
import { useAuth } from "@/auth/AuthProvider";
import { Header } from "@/components/lyve/Header";
import { Footer } from "@/components/lyve/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  SUPPORT_CATEGORIES,
  createSupportTicket,
  listMySupportTickets,
  listMyTicketReplies,
  replyToMyTicket,
  type SupportCategory,
} from "@/lib/support.functions";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: "Support — LYVE help and in-app tickets" },
      {
        name: "description",
        content:
          "Open an in-app LYVE support ticket for account, safety, billing, or technical help and track its status.",
      },
      { property: "og:title", content: "Support — LYVE help and in-app tickets" },
      {
        property: "og:description",
        content: "Open an in-app LYVE support ticket and track its status.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SupportPage,
});

function SupportPage() {
  const { t } = useI18n();
  const { isAuthenticated } = useAuth();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-14 sm:px-6">
        <h1 className="font-display text-3xl text-foreground sm:text-4xl">{t.support.title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{t.support.subtitle}</p>
        {isAuthenticated ? <TicketForm /> : <SignedOut />}
      </main>
      <Footer />
    </div>
  );
}

function SignedOut() {
  const { t } = useI18n();
  return (
    <section className="mt-8 rounded-2xl border border-border bg-surface p-6">
      <h2 className="text-lg font-semibold text-foreground">{t.support.signedOutTitle}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{t.support.signedOutBody}</p>
      <Button asChild className="mt-5 rounded-full">
        <Link to="/auth">{t.support.signIn}</Link>
      </Button>
    </section>
  );
}

function TicketForm() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const submit = useServerFn(createSupportTicket);
  const fetchTickets = useServerFn(listMySupportTickets);

  const [category, setCategory] = useState<SupportCategory>("account");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const tickets = useQuery({
    queryKey: ["support", "tickets"],
    queryFn: () => fetchTickets(),
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: () => submit({ data: { category, subject, body } }),
    onSuccess: () => {
      setSubject("");
      setBody("");
      void queryClient.invalidateQueries({ queryKey: ["support", "tickets"] });
    },
  });

  const canSubmit = subject.trim().length >= 3 && body.trim().length >= 10 && !mutation.isPending;

  return (
    <>
      <form
        className="mt-8 space-y-5 rounded-2xl border border-border bg-surface p-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) mutation.mutate();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="support-category">{t.support.category}</Label>
          <select
            id="support-category"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
            value={category}
            onChange={(event) => setCategory(event.target.value as SupportCategory)}
          >
            {SUPPORT_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {t.support.categories[value]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="support-subject">{t.support.subject}</Label>
          <Input
            id="support-subject"
            value={subject}
            maxLength={140}
            placeholder={t.support.subjectPlaceholder}
            onChange={(event) => setSubject(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="support-body">{t.support.message}</Label>
          <Textarea
            id="support-body"
            value={body}
            rows={6}
            maxLength={4000}
            placeholder={t.support.messagePlaceholder}
            onChange={(event) => setBody(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">{t.support.privacyNote}</p>
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" className="rounded-full" disabled={!canSubmit}>
            {mutation.isPending ? t.support.sending : t.support.submit}
          </Button>
          {mutation.isSuccess ? (
            <span className="text-sm text-muted-foreground">{t.support.success}</span>
          ) : null}
          {mutation.isError ? (
            <span className="text-sm text-destructive">{t.support.error}</span>
          ) : null}
        </div>
      </form>

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
          {t.support.myTickets}
        </h2>
        {tickets.data && tickets.data.length > 0 ? (
          <ul className="mt-4 space-y-3">
            {tickets.data.map((ticket) => (
              <li key={ticket.id} className="rounded-xl border border-border bg-surface p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{ticket.subject}</span>
                  <Badge variant="secondary">
                    {t.support.statuses[ticket.status as keyof typeof t.support.statuses] ??
                      ticket.status}
                  </Badge>
                  <span className="ms-auto text-xs text-muted-foreground">
                    {new Date(ticket.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                  {ticket.body}
                </p>
                <TicketThread ticketId={ticket.id} status={ticket.status} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">{t.support.empty}</p>
        )}
      </section>
    </>
  );
}

/** Member-visible conversation for one of their own tickets. */
function TicketThread({ ticketId, status }: { ticketId: string; status: string }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const fetchReplies = useServerFn(listMyTicketReplies);
  const sendReply = useServerFn(replyToMyTicket);
  const [body, setBody] = useState("");

  const replies = useQuery({
    queryKey: ["support", "thread", ticketId],
    queryFn: () => fetchReplies({ data: { ticketId } }),
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: (value: string) => sendReply({ data: { ticketId, body: value } }),
    onSuccess: () => {
      setBody("");
      void queryClient.invalidateQueries({ queryKey: ["support", "thread", ticketId] });
      void queryClient.invalidateQueries({ queryKey: ["support", "tickets"] });
    },
  });

  const isClosed = status === "closed" || status === "resolved";

  return (
    <div className="mt-4 space-y-3 border-t border-border pt-4">
      {replies.data && replies.data.length > 0 ? (
        <ul className="space-y-2">
          {replies.data.map((row) => (
            <li
              key={row.id}
              className={`rounded-lg p-3 text-sm ${
                row.isStaff ? "bg-primary/10 text-foreground" : "bg-muted text-foreground"
              }`}
            >
              <div className="mb-1 text-xs text-muted-foreground">
                {row.isStaff ? t.support.staffReply : t.support.yourReply} ·{" "}
                {new Date(row.createdAt).toLocaleString()}
              </div>
              <p className="whitespace-pre-wrap">{row.body}</p>
            </li>
          ))}
        </ul>
      ) : null}

      {isClosed ? (
        <p className="text-xs text-muted-foreground">{t.support.replyClosed}</p>
      ) : (
        <div className="space-y-2">
          <Textarea
            rows={3}
            maxLength={4000}
            value={body}
            placeholder={t.support.replyPlaceholder}
            onChange={(event) => setBody(event.target.value)}
          />
          <div className="flex items-center gap-3">
            <Button
              type="button"
              size="sm"
              className="rounded-full"
              disabled={body.trim().length < 2 || mutation.isPending}
              onClick={() => mutation.mutate(body.trim())}
            >
              {t.support.replySend}
            </Button>
            {mutation.isError ? (
              <span className="text-sm text-destructive">{t.support.replyError}</span>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
