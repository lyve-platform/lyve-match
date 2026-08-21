/**
 * Post-restart / post-deploy SSR smoke test.
 *
 * Reloads the landing page (and a few key routes) against a running server and
 * asserts the HTML is real rendered content, not a blank shell or the fallback
 * error page. Run with:
 *
 *   bun run test:smoke                       # http://localhost:8080
 *   SMOKE_BASE_URL=https://lyve-match.lovable.app bun run test:smoke
 */

const BASE_URL = (process.env["SMOKE_BASE_URL"] ?? "http://localhost:8080").replace(/\/$/, "");
const ROUTES = (process.env["SMOKE_ROUTES"] ?? "/,/auth,/privacy,/terms").split(",");
const ATTEMPTS = Number(process.env["SMOKE_ATTEMPTS"] ?? 5);
const RETRY_DELAY_MS = 2_000;

type Result = { route: string; ok: boolean; detail: string };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForServer(): Promise<void> {
  for (let attempt = 1; attempt <= 30; attempt++) {
    try {
      const response = await fetch(`${BASE_URL}/`, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // server not up yet
    }
    await sleep(1_000);
  }
  throw new Error(`Server at ${BASE_URL} never became reachable`);
}

async function checkRoute(route: string): Promise<Result> {
  let detail = "no attempts";
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const response = await fetch(`${BASE_URL}${route}`, {
        headers: { "x-request-id": `smoke-${route}-${attempt}` },
      });
      const html = await response.text();

      if (!response.ok) {
        detail = `HTTP ${response.status}`;
      } else if (/This page didn&#039;t load|This page didn't load|Reconnecting to LYVE/.test(html)) {
        detail = "fallback error page served";
      } else if (!/<div id="root"|<!DOCTYPE html|<!doctype html/i.test(html)) {
        detail = "response is not an HTML document";
      } else if (html.length < 1_000) {
        detail = `suspiciously small document (${html.length} bytes)`;
      } else if (!/<body[\s\S]*<\/body>/i.test(html)) {
        detail = "no <body> content";
      } else {
        return { route, ok: true, detail: `HTTP 200, ${html.length} bytes` };
      }
    } catch (error) {
      detail = error instanceof Error ? error.message : String(error);
    }
    if (attempt < ATTEMPTS) await sleep(RETRY_DELAY_MS);
  }
  return { route, ok: false, detail };
}

async function main() {
  console.log(`SSR smoke test against ${BASE_URL}`);
  await waitForServer();

  const results: Result[] = [];
  for (const route of ROUTES) {
    const result = await checkRoute(route.trim());
    results.push(result);
    console.log(`${result.ok ? "PASS" : "FAIL"}  ${result.route}  ${result.detail}`);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} routes healthy`);
  if (failed.length > 0) process.exit(1);
}

void main();
