import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/lyve/LegalPage";

const title = "Community Guidelines (Draft) — LYVE";
const description =
  "Draft outline of the behaviour LYVE expects from members and what is not tolerated. Not a final document.";

export const Route = createFileRoute("/community-guidelines")({
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
  component: () => <LegalPage page="guidelines" />,
});
