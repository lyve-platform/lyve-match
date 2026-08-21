import { useState } from "react";
import { Heart, MapPin, X } from "lucide-react";
import { useI18n } from "@/i18n";
import { fill } from "@/lib/format";
import type { DiscoveryCard } from "@/lib/discovery-core";
import { CompatibilityInsight } from "./CompatibilityInsight";
import { VerifiedBadge } from "./VerifiedBadge";
import { SafetyMenu } from "./SafetyMenu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useInterestLabel } from "@/hooks/useInterestLabel";

function intentLabel(t: { enums: { intent: Record<string, string> } }, intent: string) {
  return t.enums.intent[intent] ?? intent;
}

/**
 * LYVE's own discovery card: a calm, editorial layout built from our design
 * tokens. No swipe-deck imitation, no gamified stack — one person at a time,
 * with the reasons you might connect right next to the decision.
 */
export function DiscoveryProfileCard({
  card,
  onLike,
  onPass,
  onRemoved,
  busy,
}: {
  card: DiscoveryCard;
  onLike: () => void;
  onPass: () => void;
  onRemoved?: (() => void) | undefined;
  busy?: boolean | undefined;
}) {
  const { t } = useI18n();
  const [photoIndex, setPhotoIndex] = useState(0);
  const name = card.firstName || "—";
  const photo = card.photoUrls[photoIndex];

  const interestLabel = useInterestLabel();

  return (
    <Card className="overflow-hidden border-border/70 p-0 shadow-sm">
      <div className="relative aspect-[4/5] w-full bg-muted">
        {photo ? (
          <img
            src={photo}
            alt={fill(t.discover.photoAlt, { name })}
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
            {t.discover.noPhoto}
          </div>
        )}

        {card.photoUrls.length > 1 ? (
          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
            {card.photoUrls.map((url, index) => (
              <button
                key={url}
                type="button"
                aria-label={`${index + 1}/${card.photoUrls.length}`}
                aria-current={index === photoIndex}
                onClick={() => setPhotoIndex(index)}
                className={`h-2 w-6 rounded-full transition ${
                  index === photoIndex ? "bg-primary" : "bg-background/60"
                }`}
              />
            ))}
          </div>
        ) : null}

        <div className="absolute end-2 top-2">
          <div className="rounded-full bg-background/80 backdrop-blur">
            <SafetyMenu profileId={card.profileId} name={name} onDone={onRemoved} />
          </div>
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div>
          <h2 className="text-xl font-semibold">
            {name}
            {card.age ? <span className="text-muted-foreground">, {card.age}</span> : null}
            <VerifiedBadge verified={card.verified} className="ms-2 align-middle" />
          </h2>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="size-4" aria-hidden="true" />
            <span>
              {[card.city, card.country].filter(Boolean).join(", ")}
              {card.distanceBucketKm !== null
                ? ` · ${
                    card.distanceBucketKm <= 5
                      ? t.discover.awayNear
                      : fill(t.discover.away, { distance: card.distanceBucketKm })
                  }`
                : ""}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">{t.discover.aboutLocation}</p>
        </div>

        {card.intent ? (
          <p className="text-sm">
            <span className="text-muted-foreground">{t.discover.intentLabel}: </span>
            {intentLabel(t, card.intent)}
          </p>
        ) : null}

        {card.bio ? <p className="text-pretty text-sm leading-relaxed">{card.bio}</p> : null}

        {card.interestSlugs.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5" aria-label={t.discover.interestsLabel}>
            {card.interestSlugs.map((slug) => (
              <li key={slug}>
                <Badge variant="secondary" className="rounded-full font-normal">
                  {interestLabel(slug)}
                </Badge>
              </li>
            ))}
          </ul>
        ) : null}

        <CompatibilityInsight compatibility={card.compatibility} interestLabel={interestLabel} />

        <div className="flex gap-3 pt-1">
          <Button
            type="button"
            variant="outline"
            className="min-h-12 flex-1 rounded-full"
            onClick={onPass}
            disabled={busy}
          >
            <X aria-hidden="true" /> {t.discover.pass}
          </Button>
          <Button
            type="button"
            className="min-h-12 flex-1 rounded-full"
            onClick={onLike}
            disabled={busy}
          >
            <Heart aria-hidden="true" /> {t.discover.like}
          </Button>
        </div>
      </div>
    </Card>
  );
}
