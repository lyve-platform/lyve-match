/**
 * Fixture sweeper.
 *
 * Every security suite creates throwaway members on the `@lyve.test` domain,
 * some of them with staff roles. An aborted or crashed run leaves those rows
 * behind, which makes the staff directory look like real people were granted
 * admin access. This sweeps every `@lyve.test` account, regardless of which
 * suite created it. Real accounts are never touched: the domain is reserved
 * for fixtures and is not a deliverable mail domain.
 *
 * Run:  bun run tests/security/sweep-test-accounts.ts
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env["SUPABASE_URL"]!;
const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;

if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const FIXTURE_DOMAIN = "@lyve.test";

export async function sweepTestAccounts(): Promise<number> {
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  let removed = 0;

  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const users = data?.users ?? [];
    if (users.length === 0) break;

    for (const user of users) {
      if (!user.email?.toLowerCase().endsWith(FIXTURE_DOMAIN)) continue;
      const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
      if (!deleteError) removed += 1;
    }

    if (users.length < 200) break;
  }

  return removed;
}

if (import.meta.main) {
  const removed = await sweepTestAccounts();
  console.log(`${removed} fixture account(s) removed`);
}
