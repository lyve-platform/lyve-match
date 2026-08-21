import { createFileRoute } from "@tanstack/react-router";
import { useI18n } from "@/i18n";
import { Header } from "@/components/lyve/Header";
import { Hero } from "@/components/lyve/Hero";
import { HowItWorks } from "@/components/lyve/HowItWorks";
import { Compatibility } from "@/components/lyve/Compatibility";
import { Intent } from "@/components/lyve/Intent";
import { Safety } from "@/components/lyve/Safety";
import { Trust } from "@/components/lyve/Trust";
import { Premium } from "@/components/lyve/Premium";
import { Testimonials } from "@/components/lyve/Testimonials";
import { Faq } from "@/components/lyve/Faq";

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
      { property: "og:url", content: "https://lyve-connect-build.lovable.app" },
      { property: "og:image", content: "https://lyve-connect-build.lovable.app/og-image.jpg" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "LYVE — Meet. Match. Belong." },
      { name: "twitter:image", content: "https://lyve-connect-build.lovable.app/og-image.jpg" },
      { name: "twitter:image:alt", content: "LYVE — Meet. Match. Belong." },
    ],
    links: [{ rel: "canonical", href: "https://lyve-connect-build.lovable.app" }],
  }),
  component: Index,
});

function Index() {
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
        <Trust />
        <Premium />
        <Testimonials />
        <Faq />
      </main>
      <Footer />
    </div>
  );
}
