import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/lyve/LegalPage";

const title = "Safety Centre (Draft) — LYVE";
const description =
  "Draft outline of LYVE safety guidance, reporting tools, and planned protections. Not a final document.";

export const Route = createFileRoute("/safety")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:url", content: "https://lyve-connect-build.lovable.app/safety" },
      { property: "og:image", content: "https://lyve-connect-build.lovable.app/og-image.jpg" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "LYVE — Meet. Match. Belong." },
      { name: "twitter:image", content: "https://lyve-connect-build.lovable.app/og-image.jpg" },
      { name: "twitter:image:alt", content: "LYVE — Meet. Match. Belong." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <LegalPage page="safety" />,
});
