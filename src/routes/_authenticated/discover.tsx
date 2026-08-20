import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AccountShell } from "@/components/lyve/AccountShell";
import { DiscoveryProfileCard } from "@/components/lyve/DiscoveryProfileCard";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/i18n";
import { useAccount } from "@/hooks/useAccount";
import { useDecision, useDiscoveryFeed } from "@/hooks/useDiscovery";

const title = "Discover people on LYVE";
const description =
  "See members who match your preferences, with an explainable compatibility estimate.";

export const Route = createFileRoute("/_authenticated/discover")({
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
  component: DiscoverPage,
});

function DiscoverPage() {
  const { t } = useI18n();
  const { data: account } = useAccount();
  const feed = useDiscoveryFeed();
  const { like, pass } = useDecision();
  const [matchName, setMatchName] = useState<string | null>(null);

  const eligible = Boolean(
    account?.profile.date_of_birth &&
    account?.profile.first_name &&
    account?.profile.gender &&
    account?.profile.relationship_intent,
  );

  const card = feed.cards[0];
  const busy = like.isPending || pass.isPending;

  async function decide(kind: "like" | "pass") {
    if (!card) return;
    const name = card.firstName;
    const profileId = card.profileId;
    try {
      if (kind === "like") {
        const result = await like.mutateAsync(profileId);
        feed.markDecided(profileId);
        if (result.matched) setMatchName(name);
      } else {
        await pass.mutateAsync(profileId);
        feed.markDecided(profileId);
      }
    } catch {
      toast.error(t.discover.error);
    }
  }

  return (
    <AccountShell title={t.discover.title} subtitle={t.discover.subtitle}>
      {!eligible ? (
        <EmptyState
          title={t.discover.incompleteTitle}
          body={t.discover.incompleteBody}
          action={
            <Button asChild className="rounded-full">
              <Link to="/onboarding">{t.discover.incompleteAction}</Link>
            </Button>
          }
        />
      ) : feed.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" /> {t.discover.loading}
        </p>
      ) : feed.isError ? (
        <EmptyState
          title={t.discover.error}
          body=""
          action={
            <Button className="rounded-full" onClick={() => void feed.refetch()}>
              {t.discover.retry}
            </Button>
          }
        />
      ) : card ? (
        <div className="mx-auto max-w-md">
          <DiscoveryProfileCard
            card={card}
            busy={busy}
            onLike={() => void decide("like")}
            onPass={() => void decide("pass")}
            onRemoved={() => feed.markDecided(card.profileId)}
          />
        </div>
      ) : feed.hasMore ? (
        <div className="text-center">
          <Button className="rounded-full" onClick={feed.loadMore}>
            {t.discover.loadMore}
          </Button>
        </div>
      ) : (
        <EmptyState
          title={t.discover.emptyTitle}
          body={t.discover.emptyBody}
          action={
            <Button asChild variant="outline" className="rounded-full">
              <Link to="/profile">{t.discover.emptyAction}</Link>
            </Button>
          }
        />
      )}

      <Dialog open={matchName !== null} onOpenChange={() => setMatchName(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.discover.matchTitle}</DialogTitle>
            <DialogDescription>{t.discover.matchBody}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setMatchName(null)}>
              {t.discover.matchClose}
            </Button>
            <Button asChild className="rounded-full">
              <Link to="/matches">{t.discover.matchGoToMatches}</Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AccountShell>
  );
}

function EmptyState({
  title: heading,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-8 text-center">
      <h2 className="text-lg font-semibold text-balance">{heading}</h2>
      {body ? (
        <p className="mx-auto mt-2 max-w-sm text-pretty text-sm text-muted-foreground">{body}</p>
      ) : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}
