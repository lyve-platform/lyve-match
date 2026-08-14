import { Logo } from "./Logo";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { useI18n } from "@/i18n";

export function Footer() {
  const { t } = useI18n();

  const columns = [
    {
      title: t.footer.product,
      links: [
        { label: t.footer.links.howItWorks, href: "#how-it-works" },
        { label: t.footer.links.compatibility, href: "#compatibility" },
        { label: t.footer.links.safety, href: "#safety" },
        { label: t.footer.links.premium, href: "#premium" },
        { label: t.footer.links.faq, href: "#faq" },
      ],
    },
    {
      title: t.footer.company,
      links: [
        { label: t.footer.links.about },
        { label: t.footer.links.careers },
        { label: t.footer.links.press },
        { label: t.footer.links.contact },
      ],
    },
    {
      title: t.footer.legal,
      links: [
        { label: t.footer.links.privacy },
        { label: t.footer.links.terms },
        { label: t.footer.links.cookies },
        { label: t.footer.links.guidelines },
      ],
    },
  ];

  return (
    <footer className="border-t border-border bg-surface px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-sm text-muted-foreground">
              {t.footer.description}
            </p>
            <LanguageSwitcher className="mt-5" />
          </div>

          {columns.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground">
                {column.title}
              </h3>
              <ul className="mt-4 space-y-2">
                {column.links.map((link) => (
                  <li key={link.label}>
                    {"href" in link && link.href ? (
                      <a
                        href={link.href}
                        className="text-sm text-muted-foreground hover:text-foreground"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        {link.label}{" "}
                        <span className="text-xs opacity-70">({t.footer.comingSoon})</span>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-border pt-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} LYVE. {t.footer.rights}</p>
          <p>{t.footer.ageNotice}</p>
        </div>
      </div>
    </footer>
  );
}
