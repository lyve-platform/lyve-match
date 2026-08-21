export type ErrorPageVariant = "error" | "aborted";

type ErrorPageOptions = {
  variant?: ErrorPageVariant;
  requestId?: string;
  /** Seconds before the page reloads itself. 0 disables auto-retry. */
  retryAfterSeconds?: number;
};

/**
 * Dependency-free fallback HTML. It must never import app code: the same
 * failure that triggered it could also break the app bundle.
 */
export function renderErrorPage(options: ErrorPageOptions = {}): string {
  const { variant = "error", requestId, retryAfterSeconds = variant === "aborted" ? 3 : 0 } =
    options;

  const aborted = variant === "aborted";
  const title = aborted ? "Reconnecting to LYVE" : "This page didn't load";
  const body = aborted
    ? "The connection dropped while this page was loading. We're retrying automatically — nothing was lost."
    : "Something went wrong on our end. You can try refreshing or head back home.";

  const autoRetry =
    retryAfterSeconds > 0
      ? `<script>setTimeout(function(){location.reload()}, ${Math.round(retryAfterSeconds * 1000)});</script>`
      : "";

  const idLine = requestId
    ? `<p class="meta">Reference: ${escapeHtml(requestId)}</p>`
    : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font: 15px/1.5 system-ui, -apple-system, sans-serif; background: #fafafa; color: #111; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      @media (prefers-color-scheme: dark) { body { background: #0c0a09; color: #fafaf9; } p { color: #a8a29e !important; } .secondary { background: #1c1917 !important; color: #fafaf9 !important; border-color: #292524 !important; } .primary { background: #fafaf9 !important; color: #0c0a09 !important; } }
      .card { max-width: 28rem; width: 100%; text-align: center; padding: 2rem; }
      h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
      p { color: #4b5563; margin: 0 0 1.5rem; }
      .meta { font-size: 0.75rem; opacity: 0.7; margin-top: 1.5rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button { padding: 0.5rem 1rem; border-radius: 0.375rem; font: inherit; cursor: pointer; text-decoration: none; border: 1px solid transparent; }
      .primary { background: #111; color: #fff; }
      .secondary { background: #fff; color: #111; border-color: #d1d5db; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(body)}</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Try again</button>
        <a class="secondary" href="/">Go home</a>
      </div>
      ${idLine}
    </div>
    ${autoRetry}
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
