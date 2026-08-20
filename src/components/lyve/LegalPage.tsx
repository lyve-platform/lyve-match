import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, FileText } from "lucide-react";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { useI18n } from "@/i18n";

type LegalContent = {
  title: string;
  description: string;
  intro: string;
  sections: ReadonlyArray<{ title: string; body: string }>;
  /** Present on finalised documents; absent documents fall back to the draft banner. */
  status?: string;
  effective?: string;
  notice?: { title: string; body: string };
  contact?: { title: string; body: string };
};

export function LegalPage({ page }: { page: keyof ReturnType<typeof usePages> }) {
  const { t, dir } = useI18n();
  const pages = usePages();
  const content: LegalContent = pages[page];
  const BackIcon = dir === "rtl" ? ArrowRight : ArrowLeft;
  const noticeTitle = content.notice?.title ?? t.legal.draftTitle;
  const noticeBody = content.notice?.body ?? t.legal.draftBody;
  const questionsTitle = content.contact?.title ?? t.legal.questionsTitle;
  const questionsBody = content.contact?.body ?? t.legal.questionsBody;

  return (
    <div className="min-h-screen bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        {t.nav.skipToContent}
      </a>
      <Header />
      <main id="main" className="px-4 py-12 sm:px-6 md:py-16">
        <div className="mx-auto max-w-3xl">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-full px-2 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <BackIcon aria-hidden="true" className="size-4" />
            {t.legal.backToHome}
          </Link>

          <header className="mt-6">
            <p className="inline-flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <FileText aria-hidden="true" className="size-3.5" />
              {t.legal.statusLabel}: {content.status ?? t.legal.statusValue}
            </p>
            <h1 className="mt-4 text-3xl font-semibold text-balance md:text-4xl">
              {content.title}
            </h1>
            {content.effective ? (
              <p className="mt-2 text-sm text-muted-foreground">
                {t.legal.effectiveLabel}: {content.effective}
              </p>
            ) : null}
            <p className="mt-4 text-pretty text-base text-muted-foreground">{content.intro}</p>
          </header>

          <div role="note" className="surface-panel mt-8 border-s-4 border-s-primary p-5">
            <h2 className="text-base font-semibold text-foreground">{noticeTitle}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{noticeBody}</p>
          </div>

          <section aria-labelledby="outline-heading" className="mt-12">
            <h2 id="outline-heading" className="text-xl font-semibold">
              {content.notice ? t.legal.contentsTitle : t.legal.outlineTitle}
            </h2>
            <ol className="mt-6 space-y-4">
              {content.sections.map((section, index) => (
                <li key={section.title} className="surface-panel p-5">
                  <h3 className="flex items-baseline gap-3 text-base font-semibold text-foreground">
                    <span className="text-sm font-semibold text-primary">{index + 1}.</span>
                    {section.title}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">{section.body}</p>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="questions-heading" className="mt-12">
            <h2 id="questions-heading" className="text-xl font-semibold">
              {questionsTitle}
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">{questionsBody}</p>
            <Link
              to="/support"
              className="mt-4 inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              {t.support.link}
            </Link>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function usePages() {
  const { t } = useI18n();
  return t.legal.pages;
}
