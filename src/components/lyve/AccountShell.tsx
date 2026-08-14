import type { ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "./Logo";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { ThemeToggle } from "./ThemeToggle";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useAuth } from "@/auth/AuthProvider";

export function AccountShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        {t.nav.skipToContent}
      </a>

      <header className="sticky top-0 z-50 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link to="/" aria-label={t.brand.name} className="min-w-0">
            <Logo />
          </Link>
          <nav aria-label="Account" className="flex flex-wrap items-center justify-end gap-1">
            <Button asChild variant="ghost" size="sm" className="rounded-full">
              <Link to="/discover">{t.discoverNav.discover}</Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="rounded-full">
              <Link to="/likes">{t.discoverNav.likes}</Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="rounded-full">
              <Link to="/matches">{t.discoverNav.matches}</Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="hidden rounded-full sm:inline-flex">
              <Link to="/profile">{t.authNav.profile}</Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="rounded-full">
              <Link to="/settings">{t.authNav.settings}</Link>
            </Button>
            <LanguageSwitcher className="hidden sm:inline-flex" />
            <ThemeToggle />
            <Button
              variant="outline"
              size="icon"
              className="min-h-11 min-w-11 rounded-full"
              onClick={handleSignOut}
              aria-label={t.authNav.signOut}
              title={t.authNav.signOut}
            >
              <LogOut aria-hidden="true" />
            </Button>
          </nav>
        </div>
      </header>

      <main id="main" className="px-4 pb-20 pt-8 sm:px-6">
        <div className="mx-auto w-full max-w-3xl">
          <h1 className="text-2xl font-semibold text-balance md:text-3xl">{title}</h1>
          <p className="mt-2 text-pretty text-sm text-muted-foreground">{subtitle}</p>
          {user?.email ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {t.authNav.signedInAs} {user.email}
            </p>
          ) : null}
          <div className="mt-8 space-y-6">{children}</div>
        </div>
      </main>
    </div>
  );
}
