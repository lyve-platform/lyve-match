import { createFileRoute } from "@tanstack/react-router";
import { Heart, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AccountShell } from "@/components/lyve/AccountShell";
import { SafetyMenu } from "@/components/lyve/SafetyMenu";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/i18n";
import { useDecision, useLikesReceived } from "@/hooks/useDiscovery";

const title = "Likes you received on LYVE";
const description = "See who liked you on LYVE and like them back to create a match.";

export const Route = createFileRoute("/_authenticated/likes")({
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
  component: LikesPage,
});

function LikesPage() {
  const { t } = useI18n();
  const { data, isLoading } = useLikesReceived();
  const { like } = useDecision();

  async function likeBack(profileId: string) {
    try {
      const result = await like.mutateAsync(profileId);
      toast.success(result.matched ? t.discover.matchTitle : t.discover.liked);
    } catch {
      toast.error(t.discover.error);
    }
  }

  return (
    <AccountShell title={t.likesPage.title} subtitle={t.likesPage.subtitle}>
      {isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" /> {t.discover.loading}
        </p>
      ) : (data ?? []).length === 0 ? (
        <p className="rounded-2xl border border-border/70 bg-card p-8 text-center text-sm text-muted-foreground">
          {t.likesPage.empty}
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {(data ?? []).map((person) => (
            <li key={person.profileId}>
              <Card className="flex gap-4 overflow-hidden p-4">
                <div className="size-20 shrink-0 overflow-hidden rounded-xl bg-muted">
                  {person.photoUrls[0] ? (
                    <img
                      src={person.photoUrls[0]}
                      alt={t.discover.photoAlt.replace("{name}", person.firstName || "—")}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="truncate font-semibold">
                      {person.firstName || "—"}
                      {person.age ? <span className="text-muted-foreground">, {person.age}</span> : null}
                    </h2>
                    <SafetyMenu profileId={person.profileId} name={person.firstName || "—"} />
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    {[person.city, person.country].filter(Boolean).join(", ")}
                  </p>
                  <Button
                    className="mt-3 min-h-11 rounded-full"
                    size="sm"
                    disabled={like.isPending}
                    onClick={() => void likeBack(person.profileId)}
                  >
                    <Heart aria-hidden="true" /> {t.likesPage.likeBack}
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </AccountShell>
  );
}
