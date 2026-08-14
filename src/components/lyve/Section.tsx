import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Section({
  id,
  eyebrow,
  title,
  subtitle,
  children,
  className,
  tone = "default",
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  tone?: "default" | "surface";
}) {
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn(
        "scroll-mt-24 px-4 py-16 sm:px-6 md:py-24",
        tone === "surface" && "bg-surface",
        className,
      )}
    >
      <div className="mx-auto max-w-6xl">
        <header className="mx-auto max-w-2xl text-center">
          {eyebrow ? (
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              {eyebrow}
            </p>
          ) : null}
          <h2
            id={headingId}
            className="mt-3 text-balance text-3xl font-semibold md:text-4xl"
          >
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-4 text-pretty text-base text-muted-foreground">{subtitle}</p>
          ) : null}
        </header>
        <div className="mt-12">{children}</div>
      </div>
    </section>
  );
}
