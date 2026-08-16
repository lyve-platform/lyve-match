import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/lyve/LegalPage";

const title = "Terms of Service (Draft) — LYVE";
const description =
  "Draft outline of the rules for using LYVE, eligibility, and account responsibilities. Not a final legal document.";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:url", content: "https://lyve-connect-build.lovable.app/terms" },
      { property: "og:image", content: "https://lyve-connect-build.lovable.app/og-image.jpg" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "LYVE — Meet. Match. Belong." },
      { name: "twitter:image", content: "https://lyve-connect-build.lovable.app/og-image.jpg" },
      { name: "twitter:image:alt", content: "LYVE — Meet. Match. Belong." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <LegalPage page="terms" />,
});
