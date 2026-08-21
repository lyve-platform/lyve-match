import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Logo } from "@/components/lyve/Logo";
import { ThemeToggle } from "@/components/lyve/ThemeToggle";
import { useI18n } from "@/i18n";

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const { t } = useI18n();

  return (
    <div className="min-h-screen bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        {t.nav.skipToContent}
      </a>
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link to="/" aria-label={t.brand.name} className="min-w-0">
          <Logo />
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
        </div>
      </header>

      <main id="main" className="px-4 pb-16 pt-4 sm:px-6">
        <div className="mx-auto w-full max-w-md">
          <h1 className="text-2xl font-semibold text-balance md:text-3xl">{title}</h1>
          <p className="mt-2 text-pretty text-sm text-muted-foreground">{subtitle}</p>
          <div className="surface-panel mt-6 p-5 sm:p-6">{children}</div>
        </div>
      </main>
    </div>
  );
}
