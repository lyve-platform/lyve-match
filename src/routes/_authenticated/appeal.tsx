import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { useI18n } from "@/i18n";
import { fill } from "@/lib/format";
import { APPEAL_BODY_MAX, APPEAL_BODY_MIN } from "@/lib/admin-core";
import { useMyStanding, useSubmitAppeal } from "@/hooks/useAdmin";
import { AccountShell } from "@/components/lyve/AccountShell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/appeal")({
  head: () => ({
    meta: [
      { title: "Request an account review — LYVE" },
      {
        name: "description",
        content:
          "Ask the LYVE Trust & Safety team to reconsider a restriction, suspension or ban on your account.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Request an account review — LYVE" },
      {
        property: "og:description",
        content: "Ask LYVE Trust & Safety to reconsider a decision about your account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AppealPage,
});

function AppealPage() {
  const { t, locale } = useI18n();
  const standing = useMyStanding();
  const submit = useSubmitAppeal();
  const [body, setBody] = useState("");

  const formatDate = (value: string) =>
    new Date(value).toLocaleDateString("en", { dateStyle: "medium" });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (body.trim().length < APPEAL_BODY_MIN) {
      toast.error(t.standing.tooShort);
      return;
    }
    try {
      await submit.mutateAsync(body.trim());
      setBody("");
      toast.success(t.standing.sent);
    } catch {
      toast.error(t.standing.failed);
    }
  }

  return (
    <AccountShell title={t.standing.title} subtitle={t.standing.subtitle}>
      {standing.isPending ? (
        <p className="text-sm text-muted-foreground">{t.admin.loading}</p>
      ) : null}

      {standing.data && standing.data.status === "active" ? (
        <div className="rounded-xl border border-border p-6">
          <h2 className="text-base font-medium">{t.standing.okTitle}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t.standing.okBody}</p>
        </div>
      ) : null}

      {standing.data?.appeal ? (
        <div className="rounded-xl bg-muted/50 p-4 text-sm">
          {standing.data.appeal.status === "pending" ||
          standing.data.appeal.status === "reviewing" ? (
            <p>{fill(t.standing.pending, { date: formatDate(standing.data.appeal.createdAt) })}</p>
          ) : (
            <p>
              {fill(t.standing.decision, {
                status: t.admin.appeals.statusLabels[standing.data.appeal.status],
              })}
            </p>
          )}
          {standing.data.appeal.decisionNote ? (
            <p className="mt-2 text-muted-foreground">{standing.data.appeal.decisionNote}</p>
          ) : null}
        </div>
      ) : null}

      {standing.data?.canAppeal ? (
        <form onSubmit={handleSubmit} className="space-y-3">
          <Label htmlFor="appeal-body">{t.standing.label}</Label>
          <Textarea
            id="appeal-body"
            value={body}
            rows={6}
            maxLength={APPEAL_BODY_MAX}
            placeholder={t.standing.placeholder}
            onChange={(event) => setBody(event.target.value)}
          />
          <Button type="submit" className="rounded-full" disabled={submit.isPending}>
            {t.standing.submit}
          </Button>
        </form>
      ) : null}
    </AccountShell>
  );
}
