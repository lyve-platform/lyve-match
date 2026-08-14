import { createFileRoute } from "@tanstack/react-router";
import { I18nProvider, useI18n } from "@/i18n";
import { Header } from "@/components/lyve/Header";
import { Hero } from "@/components/lyve/Hero";
import { HowItWorks } from "@/components/lyve/HowItWorks";
import { Compatibility } from "@/components/lyve/Compatibility";
import { Intent } from "@/components/lyve/Intent";
import { Safety } from "@/components/lyve/Safety";
import { Premium } from "@/components/lyve/Premium";
import { Testimonials } from "@/components/lyve/Testimonials";
import { Faq } from "@/components/lyve/Faq";
import { FinalCta } from "@/components/lyve/FinalCta";
import { Footer } from "@/components/lyve/Footer";

const title = "LYVE — Meet. Match. Belong.";
const description =
  "LYVE is a global 18+ platform for dating, serious relationships, and marriage. Discover people who match your vibe, goals, and way of life.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Landing() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        {t.nav.skipToContent}
      </a>
      <Header />
      <main id="main">
        <Hero />
        <HowItWorks />
        <Compatibility />
        <Intent />
        <Safety />
        <Premium />
        <Testimonials />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}

function Index() {
  return (
    <I18nProvider>
      <Landing />
    </I18nProvider>
  );
}
