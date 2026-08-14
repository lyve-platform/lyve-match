import { cn } from "@/lib/utils";

export function CompatibilityRing({
  value,
  label,
  className,
  size = 168,
}: {
  value: number;
  label: string;
  className?: string;
  size?: number;
}) {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - value / 100);

  return (
    <div
      className={cn("relative grid place-items-center", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${value}% ${label}`}
    >
      <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden="true">
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="var(--color-muted)"
          strokeWidth="7"
        />
        <defs>
          <linearGradient id="lyve-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="oklch(0.72 0.14 60)" />
            <stop offset="100%" stopColor="oklch(0.5 0.15 20)" />
          </linearGradient>
        </defs>
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="url(#lyve-ring)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute text-center" aria-hidden="true">
        <div className="font-display text-3xl font-semibold text-foreground">{value}%</div>
        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </div>
      </div>
    </div>
  );
}
