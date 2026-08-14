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
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <LegalPage page="safety" />,
});
