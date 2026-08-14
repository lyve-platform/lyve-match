import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "./Logo";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { ThemeToggle } from "./ThemeToggle";
import { useI18n } from "@/i18n";

export function Header() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  const links = [
    { href: "/#how-it-works", label: t.nav.howItWorks },
    { href: "/#compatibility", label: t.nav.compatibility },
    { href: "/#intent", label: t.nav.intent },
    { href: "/#safety", label: t.nav.safety },
    { href: "/#premium", label: t.nav.premium },
    { href: "/#faq", label: t.nav.faq },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/85 backdrop-blur">
      <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3 sm:px-6">
        <a href="/" className="min-w-0" aria-label={t.brand.name}>
          <Logo />
        </a>

        <div className="flex items-center gap-2">
          <nav aria-label="Primary" className="hidden lg:block">
            <ul className="flex items-center gap-1">
              {links.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <LanguageSwitcher className="hidden md:inline-flex" />

          <ThemeToggle />

          <Button asChild className="hidden shrink-0 rounded-full sm:inline-flex">
            <a href="/#final-cta">{t.nav.getStarted}</a>
          </Button>

          <Button
            variant="outline"
            size="icon"
            className="min-h-11 min-w-11 rounded-full lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? t.nav.closeMenu : t.nav.openMenu}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </Button>
        </div>
      </div>

      {open ? (
        <nav
          id="mobile-nav"
          aria-label="Mobile"
          className="border-t border-border bg-background px-4 pb-5 pt-3 sm:px-6 lg:hidden"
        >
          <ul className="flex flex-col gap-1">
            {links.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-3 text-base font-medium text-foreground hover:bg-muted"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <LanguageSwitcher />
            <Button asChild className="rounded-full">
              <a href="/#final-cta" onClick={() => setOpen(false)}>
                {t.nav.getStarted}
              </a>
            </Button>
          </div>
        </nav>
      ) : null}
    </header>
  );
}
