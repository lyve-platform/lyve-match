import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useI18n } from "@/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  SUPPORT_TICKET_STATUSES,
  adminListSupportTickets,
  adminListTicketReplies,
  adminReplySupportTicket,
  type AdminSupportTicket,
  type SupportTicketStatus,
} from "@/lib/support-admin.functions";

/**
 * Staff support queue. Every action re-checks the caller's
 * `support.tickets.*` permission inside the database.
 */
export function AdminSupportPanel({
  enabled,
  permissions,
}: {
  enabled: boolean;
  permissions: string[];
}) {
  const { t } = useI18n();
  const list = useServerFn(adminListSupportTickets);
  const [status, setStatus] = useState<SupportTicketStatus | "all">("open");
  const [openId, setOpenId] = useState<string | null>(null);

  const tickets = useQuery({
    queryKey: ["admin", "support-tickets", status],
    queryFn: () => list({ data: { status: status === "all" ? null : status, page: 0 } }),
    enabled,
    retry: false,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {(["all", ...SUPPORT_TICKET_STATUSES] as const).map((value) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={status === value ? "default" : "outline"}
            className="rounded-full"
            onClick={() => setStatus(value)}
          >
            {value === "all" ? t.adminSupport.filterAll : t.adminSupport.statuses[value]}
          </Button>
        ))}
      </div>

      {tickets.isError ? (
        <p className="text-sm text-destructive">{t.admin.error}</p>
      ) : tickets.data && tickets.data.length > 0 ? (
        <ul className="space-y-3">
          {tickets.data.map((ticket) => (
            <TicketRow
              key={ticket.id}
              ticket={ticket}
              permissions={permissions}
              open={openId === ticket.id}
              onToggle={() => setOpenId(openId === ticket.id ? null : ticket.id)}
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          {tickets.isPending ? t.admin.loading : t.adminSupport.empty}
        </p>
      )}
    </div>
  );
}

function TicketRow({
  ticket,
  permissions,
  open,
  onToggle,
}: {
  ticket: AdminSupportTicket;
  permissions: string[];
  open: boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const fetchReplies = useServerFn(adminListTicketReplies);
  const reply = useServerFn(adminReplySupportTicket);
  const [body, setBody] = useState("");

  const canReply = permissions.includes("support.tickets.reply");
  const canClose = permissions.includes("support.tickets.close");

  const replies = useQuery({
    queryKey: ["admin", "support-thread", ticket.id],
    queryFn: () => fetchReplies({ data: { ticketId: ticket.id } }),
    enabled: open,
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: (input: { body?: string; status?: SupportTicketStatus }) =>
      reply({
        data: {
          ticketId: ticket.id,
          ...(input.body ? { body: input.body } : {}),
          ...(input.status ? { status: input.status } : {}),
        },
      }),
    onSuccess: () => {
      setBody("");
      void queryClient.invalidateQueries({ queryKey: ["admin", "support-thread", ticket.id] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "support-tickets"] });
    },
  });

  return (
    <li className="rounded-xl border border-border bg-surface p-4">
      <button type="button" className="w-full text-start" onClick={onToggle}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">{ticket.subject}</span>
          <Badge variant="secondary">{t.adminSupport.statuses[ticket.status]}</Badge>
          <Badge variant="outline">{ticket.category}</Badge>
          {ticket.replyCount > 0 ? (
            <span className="text-xs text-muted-foreground">
              {t.adminSupport.replies}: {ticket.replyCount}
            </span>
          ) : null}
          <span className="ms-auto text-xs text-muted-foreground">
            {new Date(ticket.updatedAt).toLocaleString()}
          </span>
        </div>
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">{ticket.profileId}</p>
      </button>

      {open ? (
        <div className="mt-4 space-y-4 border-t border-border pt-4">
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{ticket.body}</p>

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
                    {row.isStaff ? t.adminSupport.staffReply : t.adminSupport.memberReply} ·{" "}
                    {new Date(row.createdAt).toLocaleString()}
                  </div>
                  <p className="whitespace-pre-wrap">{row.body}</p>
                </li>
              ))}
            </ul>
          ) : null}

          {canReply ? (
            <div className="space-y-2">
              <Textarea
                rows={4}
                maxLength={4000}
                value={body}
                placeholder={t.adminSupport.replyPlaceholder}
                onChange={(event) => setBody(event.target.value)}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="rounded-full"
                  disabled={body.trim().length < 2 || mutation.isPending}
                  onClick={() => mutation.mutate({ body: body.trim() })}
                >
                  {t.adminSupport.send}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-full"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate({ status: "open" })}
                >
                  {t.adminSupport.markOpen}
                </Button>
                {canClose ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="rounded-full"
                      disabled={mutation.isPending}
                      onClick={() => mutation.mutate({ status: "resolved" })}
                    >
                      {t.adminSupport.markResolved}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="rounded-full"
                      disabled={mutation.isPending}
                      onClick={() => mutation.mutate({ status: "closed" })}
                    >
                      {t.adminSupport.markClosed}
                    </Button>
                  </>
                ) : null}
                {mutation.isError ? (
                  <span className="text-sm text-destructive">{t.adminSupport.failed}</span>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t.adminSupport.readOnly}</p>
          )}
        </div>
      ) : null}
    </li>
  );
}
