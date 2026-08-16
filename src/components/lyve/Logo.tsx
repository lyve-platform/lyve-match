import { cn } from "@/lib/utils";
import lyveMark from "@/assets/lyve-heart.png.asset.json";

type LogoProps = {
  className?: string;
  showWordmark?: boolean;
  wordmarkClassName?: string;
  title?: string;
};

/** LYVE mark: two interlocking hearts forming a single connection glyph. */
export function Logo({
  className,
  showWordmark = true,
  wordmarkClassName,
  title = "LYVE",
}: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <img
        src={lyveMark.url}
        alt={title}
        width={32}
        height={32}
        className="h-8 w-8 shrink-0 object-contain"
        loading="eager"
        decoding="async"
      />
      {showWordmark ? (
        <span
          className={cn(
            "font-display text-xl font-semibold tracking-tight text-foreground",
            wordmarkClassName,
          )}
        >
          LYVE
        </span>
      ) : null}
    </span>
  );
}
