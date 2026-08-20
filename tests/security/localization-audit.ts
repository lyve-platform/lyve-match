/**
 * LYVE localization feature-flag security suite.
 *
 * Covers the Arabic language availability flag: admin enable/disable, audit
 * trail, member and anonymous denial, forged request bodies, and the client
 * bypass surfaces (localStorage, URL parameters, browser language).
 *
 * Run:  bun run tests/security/localization-audit.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const url = process.env["SUPABASE_URL"]!;
const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;

if (!url || !publishableKey || !serviceKey) {
  console.error("Missing SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const anon = createClient(url, publishableKey, { auth: { persistSession: false } });

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, evidence: unknown = "") {
  if (ok) {
    passed += 1;
    console.log(`PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${name} ${evidence ? `→ ${JSON.stringify(evidence)}` : ""}`);
  }
}

const stamp = Date.now();
const password = `Loc-audit-${stamp}`;
const created: string[] = [];

type Member = { id: string; client: SupabaseClient };

async function createMember(tag: string): Promise<Member> {
  const email = `loc-${tag}-${stamp}@lyve.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  created.push(data.user!.id);
  const client = createClient(url, publishableKey, { auth: { persistSession: false } });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { id: data.user!.id, client };
}

async function currentFlag(): Promise<boolean> {
  const { data } = await admin.rpc("locale_availability");
  return data === true;
}

async function main() {
  const original = await currentFlag();

  const owner = await createMember("owner");
  const member = await createMember("member");
  await admin.from("user_roles").insert({ user_id: owner.id, role: "super_admin" });

  /* ------------------------------------------------ 1. permission wiring */
  {
    const { data } = await admin
      .from("role_permissions")
      .select("role")
      .eq("permission", "settings.localization");
    const roles = (data ?? []).map((r) => r.role);
    check("settings.localization is granted to super_admin", roles.includes("super_admin"));
    check("settings.localization is not granted to moderator", !roles.includes("moderator"));
    check("settings.localization is not granted to support", !roles.includes("support"));
  }

  /* --------------------------------------------------- 2. admin can write */
  {
    const enable = await owner.client.rpc("admin_set_arabic_enabled", { p_enabled: true });
    check("super admin can enable Arabic", enable.error == null, enable.error?.message);
    check("Arabic is immediately available after enabling", (await currentFlag()) === true);

    const read = await owner.client.rpc("admin_localization_setting");
    const row = (read.data ?? [])[0] as Record<string, unknown> | undefined;
    check("admin read exposes the current status", row?.["arabic_enabled"] === true);
    check("admin read exposes the acting admin", row?.["updated_by"] === owner.id);
    check("admin read exposes a last-changed timestamp", Boolean(row?.["updated_at"]));

    const disable = await owner.client.rpc("admin_set_arabic_enabled", { p_enabled: false });
    check("super admin can disable Arabic", disable.error == null, disable.error?.message);
    check("Arabic disappears immediately after disabling", (await currentFlag()) === false);
  }

  /* ------------------------------------------------------ 3. audit trail */
  {
    const { data } = await admin
      .from("admin_audit_logs")
      .select("action, actor_id, metadata, created_at, target_type")
      .eq("action", "SETTING_CHANGED")
      .eq("actor_id", owner.id)
      .order("created_at", { ascending: true });
    const rows = data ?? [];
    check("every change is recorded in the audit log", rows.length === 2, rows.length);
    const first = rows[0]?.metadata as Record<string, unknown> | undefined;
    const second = rows[1]?.metadata as Record<string, unknown> | undefined;
    check("audit records the setting key", first?.["setting"] === "localization.arabic_enabled");
    check("audit records the previous value", first?.["previous_value"] === original);
    check("audit records the new value", first?.["new_value"] === true);
    check("audit records the disable transition", second?.["new_value"] === false);
    check("audit records the acting admin id", rows[0]?.actor_id === owner.id);
    check("audit records a timestamp", Boolean(rows[0]?.created_at));
    check("audit target type identifies a setting", rows[0]?.target_type === "app_setting");

    const tamper = await owner.client
      .from("admin_audit_logs")
      .update({ reason: "tampered" })
      .eq("actor_id", owner.id);
    const after = await admin.from("admin_audit_logs").select("reason").eq("actor_id", owner.id);
    check(
      "admin audit log stays immutable",
      (after.data ?? []).every((row) => row.reason == null),
      tamper.error?.code,
    );
  }

  /* ------------------------------------------- 4. unauthorised principals */
  {
    const memberWrite = await member.client.rpc("admin_set_arabic_enabled", { p_enabled: true });
    check(
      "a normal member cannot change the setting",
      memberWrite.error != null,
      memberWrite.error?.code,
    );

    const memberRead = await member.client.rpc("admin_localization_setting");
    check("a normal member cannot read setting provenance", memberRead.error != null);

    const memberTable = await member.client.from("app_settings").select("*");
    check(
      "a normal member reads only the public localization row",
      (memberTable.data ?? []).every((row: { key: string }) => row.key === "localization"),
    );

    const memberUpdate = await member.client
      .from("app_settings")
      .update({ value: { arabic_enabled: true } })
      .eq("key", "localization");
    check(
      "a normal member cannot update app_settings directly",
      (await currentFlag()) === false,
      memberUpdate.error?.code,
    );

    const memberInsert = await member.client
      .from("app_settings")
      .insert({ key: "localization2", value: { arabic_enabled: true } });
    check("a normal member cannot insert app_settings rows", memberInsert.error != null);

    const anonWrite = await anon.rpc("admin_set_arabic_enabled", { p_enabled: true });
    check(
      "an anonymous caller cannot change the setting",
      anonWrite.error != null,
      anonWrite.error?.code,
    );

    const anonRead = await anon.rpc("admin_localization_setting");
    check("an anonymous caller cannot read setting provenance", anonRead.error != null);

    const anonTable = await anon.from("app_settings").select("*");
    check(
      "an anonymous caller reads only the public localization row",
      (anonTable.data ?? []).every((row: { key: string }) => row.key === "localization"),
    );

    const anonPublic = await anon.rpc("locale_availability");
    check(
      "an anonymous caller may read only the effective state",
      anonPublic.error == null && anonPublic.data === false,
    );

    check("no member or anonymous attempt changed the flag", (await currentFlag()) === false);
  }

  /* ---------------------------------------------------- 5. forged requests */
  {
    const forgedBody = await fetch(`${url}/rest/v1/rpc/admin_set_arabic_enabled`, {
      method: "POST",
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${(await member.client.auth.getSession()).data.session?.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_enabled: true, actor_id: owner.id, role: "super_admin" }),
    });
    check(
      "a forged request body cannot grant authority",
      forgedBody.status >= 400,
      forgedBody.status,
    );

    const noAuth = await fetch(`${url}/rest/v1/rpc/admin_set_arabic_enabled`, {
      method: "POST",
      headers: { apikey: publishableKey, "Content-Type": "application/json" },
      body: JSON.stringify({ p_enabled: true }),
    });
    check("an unauthenticated raw HTTP call is refused", noAuth.status >= 400, noAuth.status);

    const nullValue = await owner.client.rpc("admin_set_arabic_enabled", { p_enabled: null });
    check("a null value is rejected", nullValue.error != null);

    check("the flag survived every forged attempt", (await currentFlag()) === false);
  }

  /* ------------------------------------------------ 6. client cannot bypass */
  {
    const i18n = readFileSync("src/i18n/index.tsx", "utf8");
    const switcher = readFileSync("src/components/lyve/LanguageSwitcher.tsx", "utf8");

    check(
      "the client derives availability from the server flag",
      i18n.includes('supabase.rpc("locale_availability")'),
    );
    check(
      "Arabic is never enabled by a hard-coded frontend constant",
      i18n.includes('BASE_LOCALES: readonly Locale[] = ["en"]'),
    );
    check(
      "localStorage cannot force a disabled locale",
      i18n.includes("enabledLocales.includes(preferred) ? preferred : DEFAULT_LOCALE"),
    );
    check(
      "setLocale refuses a disabled locale (URL/param/manual calls)",
      i18n.includes("if (!enabledLocales.includes(next)) return;"),
    );
    check(
      "browser language cannot bypass the server flag",
      /navigator\.language\?\.startsWith\("ar"\)/.test(i18n) && i18n.includes('setPreferred("ar")'),
    );
    check(
      "the selector renders only server-enabled locales",
      switcher.includes("enabledLocales.map") && switcher.includes("enabledLocales.length < 2"),
    );
    check(
      "the Arabic dictionary remains in the codebase",
      readFileSync("src/i18n/ar.ts", "utf8").length > 1000,
    );
    check(
      "RTL is still derived from the Arabic locale",
      i18n.includes('locale === "ar" ? "rtl" : "ltr"'),
    );
    check(
      "English remains the always-available default",
      i18n.includes('DEFAULT_LOCALE: Locale = "en"'),
    );
  }

  /* ----------------------------------------------------------- teardown */
  await admin
    .from("app_settings")
    .update({ value: { arabic_enabled: original }, updated_by: null })
    .eq("key", "localization");
  check("teardown restored the original flag", (await currentFlag()) === original);

  for (const id of created) {
    await admin.auth.admin.deleteUser(id).catch(() => undefined);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
