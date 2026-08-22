import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AccountShell } from "@/components/lyve/AccountShell";
import { SafetyMenu } from "@/components/lyve/SafetyMenu";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useI18n } from "@/i18n";
import { fill } from "@/lib/format";
import { useMatchList, useSafetyActions } from "@/hooks/useDiscovery";

const title = "Your matches on LYVE";
const description = "Everyone you and LYVE members have mutually liked, in one calm list.";

export const Route = createFileRoute("/_authenticated/matches")({
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
  component: MatchesPage,
});

function MatchesPage() {
  const { t, locale } = useI18n();
  const { data, isLoading } = useMatchList();
  const { endMatch } = useSafetyActions();
  const [pending, setPending] = useState<{ matchId: string; name: string } | null>(null);

  async function confirmUnmatch() {
    if (!pending) return;
    try {
      await endMatch.mutateAsync(pending.matchId);
      toast.success(t.matchesPage.unmatched);
    } catch {
      toast.error(t.discover.error);
    } finally {
      setPending(null);
    }
  }

  return (
    <AccountShell title={t.matchesPage.title} subtitle={t.matchesPage.subtitle}>
      {isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" /> {t.discover.loading}
        </p>
      ) : (data ?? []).length === 0 ? (
        <p className="rounded-2xl border border-border/70 bg-card p-8 text-center text-sm text-muted-foreground">
          {t.matchesPage.empty}
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {(data ?? []).map((match) => (
            <li key={match.matchId}>
              <Card className="flex gap-4 overflow-hidden p-4">
                <div className="size-20 shrink-0 overflow-hidden rounded-xl bg-muted">
                  {match.photoUrls[0] ? (
                    <img
                      src={match.photoUrls[0]}
                      alt={fill(t.discover.photoAlt, { name: match.firstName || "—" })}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="truncate font-semibold">
                      {match.firstName || "—"}
                      {match.age ? (
                        <span className="text-muted-foreground">, {match.age}</span>
                      ) : null}
                    </h2>
                    <SafetyMenu profileId={match.profileId} name={match.firstName || "—"} />
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    {[match.city, match.country].filter(Boolean).join(", ")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {fill(t.matchesPage.matchedOn, {
                      date: new Intl.DateTimeFormat("en", {
                        dateStyle: "medium",
                      }).format(new Date(match.matchedAt)),
                    })}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 min-h-11 rounded-full"
                    onClick={() =>
                      setPending({ matchId: match.matchId, name: match.firstName || "—" })
                    }
                  >
                    {t.matchesPage.unmatch}
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <AlertDialog open={pending !== null} onOpenChange={() => setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {fill(t.matchesPage.unmatchTitle, { name: pending?.name ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t.matchesPage.unmatchBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.discover.safety.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmUnmatch} disabled={endMatch.isPending}>
              {t.matchesPage.unmatchConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AccountShell>
  );
}
