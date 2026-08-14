import { cn } from "@/lib/utils";

type LogoProps = {
  className?: string;
  showWordmark?: boolean;
  wordmarkClassName?: string;
  title?: string;
};

/**
 * LYVE mark: two interlocking arcs forming an abstract "connection" glyph.
 * Original identity — no hearts, no competitor references.
 */
export function Logo({
  className,
  showWordmark = true,
  wordmarkClassName,
  title = "LYVE",
}: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg
        viewBox="0 0 40 40"
        role="img"
        aria-label={title}
        className="h-8 w-8 shrink-0"
        focusable="false"
      >
        <defs>
          <linearGradient id="lyve-mark" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="oklch(0.68 0.16 45)" />
            <stop offset="60%" stopColor="oklch(0.56 0.16 25)" />
            <stop offset="100%" stopColor="oklch(0.38 0.09 340)" />
          </linearGradient>
        </defs>
        <path
          d="M20 4.5 C10 12 6 18 6 24 a8.5 8.5 0 0 0 14 6.4"
          fill="none"
          stroke="url(#lyve-mark)"
          strokeWidth="3.2"
          strokeLinecap="round"
        />
        <path
          d="M20 35.5 C30 28 34 22 34 16 a8.5 8.5 0 0 0 -14 -6.4"
          fill="none"
          stroke="url(#lyve-mark)"
          strokeWidth="3.2"
          strokeLinecap="round"
          opacity="0.85"
        />
      </svg>
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
