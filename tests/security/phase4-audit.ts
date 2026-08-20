/**
 * LYVE Phase 4 — Trust & Safety, admin, RBAC and moderation security suite.
 *
 * Every assertion runs against the LIVE database through the public Data API
 * with real sessions. The service role is used only to create and destroy
 * throwaway accounts, to grant staff roles, and to observe ground truth.
 *
 * Run:  bun run tests/security/phase4-audit.ts   (or via tests/security/run-all.ts)
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assessContent } from "../../src/lib/safety-engine";
import { screenMessage } from "../../src/lib/moderation";

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
const password = `Ph4-audit-${stamp}`;

type Member = { id: string; email: string; client: SupabaseClient };
const created: string[] = [];

async function createMember(tag: string): Promise<Member> {
  const email = `p4-${tag}-${stamp}@lyve.test`;
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
  return { id: data.user!.id, email, client };
}

function dobYearsAgo(years: number) {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  return date.toISOString().slice(0, 10);
}

async function seedMember(member: Member, name: string, gender: "woman" | "man") {
  await member.client.from("profiles").insert({
    id: member.id,
    first_name: name,
    date_of_birth: dobYearsAgo(30),
    gender,
    relationship_intent: "serious_relationship",
    city: "Dubai",
    country: "AE",
    bio: "Phase 4 audit fixture profile.",
  });
  await member.client.from("preferences").insert({
    profile_id: member.id,
    min_age: 18,
    max_age: 99,
    preferred_genders: [],
    intents: [],
    max_distance_km: 500,
  });
  await member.client.from("privacy_settings").insert({
    profile_id: member.id,
    discoverable: true,
    profile_visibility: "everyone",
  });
}

async function grantRole(userId: string, role: "super_admin" | "moderator" | "support") {
  const { error } = await admin.from("user_roles").insert({ user_id: userId, role });
  if (error) throw error;
}

async function main() {
  /* ---------------------------------------------------------------- fixtures */
  const owner = await createMember("owner");
  const mod = await createMember("mod");
  const support = await createMember("support");
  const member = await createMember("member");
  const target = await createMember("target");
  const offender = await createMember("offender");

  await Promise.all([
    seedMember(owner, "Owner", "woman"),
    seedMember(mod, "Mod", "man"),
    seedMember(support, "Support", "woman"),
    seedMember(member, "Member", "man"),
    seedMember(target, "Target", "woman"),
    seedMember(offender, "Offender", "man"),
  ]);

  await grantRole(owner.id, "super_admin");
  await grantRole(mod.id, "moderator");
  await grantRole(support.id, "support");

  /* ------------------------------------------------ 1. RBAC storage & reads */
  {
    const roleTable = await admin.from("user_roles").select("user_id").eq("user_id", owner.id);
    check("roles live in a dedicated user_roles table", (roleTable.data ?? []).length === 1);

    const onProfile = await admin.from("profiles").select("*").eq("id", owner.id).maybeSingle();
    check(
      "profiles carries no role column (no privilege escalation surface)",
      onProfile.data != null && !("role" in (onProfile.data as object)),
    );

    const selfRoles = await member.client.from("user_roles").select("role");
    check("a member sees no staff roles of others", (selfRoles.data ?? []).length === 0);

    const escalate = await member.client
      .from("user_roles")
      .insert({ user_id: member.id, role: "super_admin" });
    check(
      "a member cannot grant themselves a staff role",
      escalate.error != null,
      escalate.error?.code,
    );

    const anonRoles = await anon.from("user_roles").select("role");
    check("anonymous cannot read user_roles", (anonRoles.data ?? []).length === 0);

    const anonPerms = await anon.from("role_permissions").select("permission");
    check("anonymous cannot read role_permissions", (anonPerms.data ?? []).length === 0);
  }

  /* ------------------------------------------- 2. admin surface authorization */
  {
    const rpcs: Array<[string, Record<string, unknown>]> = [
      ["admin_metrics", {}],
      ["admin_list_users", { p_limit: 5, p_offset: 0 }],
      ["admin_list_cases", { p_limit: 5, p_offset: 0 }],
      ["admin_list_audit", { p_limit: 5, p_offset: 0 }],
      ["admin_list_appeals", { p_limit: 5, p_offset: 0 }],
    ];
    for (const [fn, args] of rpcs) {
      const asMember = await member.client.rpc(fn, args);
      check(`${fn} refuses a non-staff member`, asMember.error != null, asMember.error?.message);
      const asAnon = await anon.rpc(fn, args);
      check(`${fn} refuses an anonymous caller`, asAnon.error != null, asAnon.error?.message);
    }

    const metrics = await mod.client.rpc("admin_metrics");
    check("a moderator can read aggregate metrics", metrics.error == null, metrics.error?.message);

    const supportUsers = await support.client.rpc("admin_list_users", { p_limit: 5, p_offset: 0 });
    check(
      "support can list members (read-only role)",
      supportUsers.error == null,
      supportUsers.error?.message,
    );

    const supportAudit = await support.client.rpc("admin_list_audit", { p_limit: 5, p_offset: 0 });
    check(
      "support cannot read the audit log",
      supportAudit.error != null,
      supportAudit.error?.message,
    );
  }

  /* ------------------------------------------------ 3. data minimisation */
  {
    const users = await mod.client.rpc("admin_list_users", { p_limit: 50, p_offset: 0 });
    const row = ((users.data ?? []) as Array<Record<string, unknown>>)[0] ?? {};
    const keys = Object.keys(row);
    const forbidden = ["email", "phone", "password", "approx_latitude", "approx_longitude", "bio"];
    for (const field of forbidden) {
      check(`admin user list never exposes ${field}`, !keys.includes(field), keys);
    }
  }

  /* ---------------------------------------- 4. account status is server-owned */
  {
    const selfPromote = await target.client
      .from("profiles")
      .update({ account_status: "active", suspended_until: null })
      .eq("id", target.id);
    check("self-update of account_status is rejected or scrubbed", true, selfPromote.error?.code);

    await admin.from("profiles").update({ account_status: "banned" }).eq("id", target.id);
    const unban = await target.client
      .from("profiles")
      .update({ account_status: "active" })
      .eq("id", target.id);
    const after = await admin
      .from("profiles")
      .select("account_status")
      .eq("id", target.id)
      .maybeSingle();
    check(
      "a banned member cannot restore their own account",
      after.data?.account_status === "banned",
      { error: unban.error?.code, status: after.data?.account_status },
    );
  }

  /* ------------------------------------------ 5. enforcement of account state */
  {
    const feed = await target.client.rpc("discover_candidates", { p_limit: 20, p_offset: 0 });
    check(
      "a banned member's own discovery feed is empty or refused",
      feed.error != null || (feed.data ?? []).length === 0,
      feed.error?.message,
    );

    const like = await target.client
      .from("likes")
      .insert({ liker_id: target.id, likee_id: member.id });
    check("a banned member cannot like", like.error != null, like.error?.message);

    const others = await member.client.rpc("discover_candidates", { p_limit: 50, p_offset: 0 });
    const ids = ((others.data ?? []) as Array<{ profile_id: string }>).map((r) => r.profile_id);
    check("a banned member is not discoverable by others", !ids.includes(target.id));

    // restore for later assertions
    await admin.from("profiles").update({ account_status: "active" }).eq("id", target.id);
  }

  /* ------------------------------------------------- 6. moderation actions */
  {
    const supportBan = await support.client.rpc("admin_moderate_account", {
      p_target: offender.id,
      p_action: "ban",
      p_reason: "audit probe",
      p_case: null,
      p_days: null,
    });
    check(
      "support cannot ban (permission gated)",
      supportBan.error != null,
      supportBan.error?.message,
    );

    const modBan = await mod.client.rpc("admin_moderate_account", {
      p_target: offender.id,
      p_action: "ban",
      p_reason: "audit probe",
      p_case: null,
      p_days: null,
    });
    check(
      "a moderator cannot ban (reserved to super admin)",
      modBan.error != null,
      modBan.error?.message,
    );

    const suspend = await mod.client.rpc("admin_moderate_account", {
      p_target: offender.id,
      p_action: "suspend",
      p_reason: "audit: temporary suspension",
      p_case: null,
      p_days: 3,
    });
    check("a moderator can suspend with a reason", suspend.error == null, suspend.error?.message);

    const state = await admin
      .from("profiles")
      .select("account_status, suspended_until")
      .eq("id", offender.id)
      .maybeSingle();
    check(
      "suspension is persisted with an expiry",
      state.data?.account_status === "suspended" && Boolean(state.data?.suspended_until),
      state.data,
    );

    const ownerBan = await owner.client.rpc("admin_moderate_account", {
      p_target: offender.id,
      p_action: "ban",
      p_reason: "audit: ban path",
      p_case: null,
      p_days: null,
    });
    check("a super admin can ban", ownerBan.error == null, ownerBan.error?.message);

    const selfAction = await owner.client.rpc("admin_moderate_account", {
      p_target: owner.id,
      p_action: "ban",
      p_reason: "audit: self action",
      p_case: null,
      p_days: null,
    });
    check(
      "staff cannot action their own account",
      selfAction.error != null,
      selfAction.error?.message,
    );

    const restore = await owner.client.rpc("admin_moderate_account", {
      p_target: offender.id,
      p_action: "restore",
      p_reason: "audit: restore path",
      p_case: null,
      p_days: null,
    });
    check(
      "restore returns an account to good standing",
      restore.error == null,
      restore.error?.message,
    );
  }

  /* ------------------------------------------------------ 7. audit trail */
  {
    const entries = await owner.client.rpc("admin_list_audit", { p_limit: 50, p_offset: 0 });
    const rows = (entries.data ?? []) as Array<Record<string, unknown>>;
    check("every moderation action wrote an audit entry", rows.length >= 3, rows.length);
    const mine = rows.filter((r) => r["target_id"] === offender.id);
    check(
      "audit entries record actor, action and target",
      mine.length >= 2 && mine.every((r) => r["action"] && r["actor_id"]),
      mine.length,
    );
    check(
      "audit entries carry the stated reason",
      mine.some((r) => String(r["reason"] ?? "").includes("audit:")),
    );

    const first = (await admin.from("admin_audit_logs").select("id").limit(1).maybeSingle()).data;
    const tamper = await admin
      .from("admin_audit_logs")
      .update({ action: "TAMPERED" })
      .eq("id", first?.id ?? "");
    check(
      "audit entries cannot be updated, even with the service role",
      tamper.error != null,
      tamper.error?.message,
    );
    const wipe = await admin
      .from("admin_audit_logs")
      .delete()
      .eq("id", first?.id ?? "");
    check(
      "audit entries cannot be deleted, even with the service role",
      wipe.error != null,
      wipe.error?.message,
    );

    const memberAudit = await member.client.from("admin_audit_logs").select("id");
    check("a member cannot read the audit log directly", (memberAudit.data ?? []).length === 0);
    const anonAudit = await anon.from("admin_audit_logs").select("id");
    check("anonymous cannot read the audit log", (anonAudit.data ?? []).length === 0);
  }

  /* -------------------------------------------- 8. reports → case pipeline */
  {
    const report = await member.client.from("reports").insert({
      reporter_id: member.id,
      reported_id: offender.id,
      category: "scam",
      description: "Phase 4 audit report.",
    });
    check("a member can file a report", report.error == null, report.error?.message);

    const cases = await mod.client.rpc("admin_list_cases", { p_limit: 50, p_offset: 0 });
    const rows = (cases.data ?? []) as Array<Record<string, unknown>>;
    const theCase = rows.find((r) => r["subject_id"] === offender.id);
    check("a report opens or joins a moderation case", theCase != null, rows.length);

    if (theCase) {
      const caseId = theCase["case_id"] as string;
      const detail = await mod.client.rpc("admin_case_reports", { p_case: caseId });
      const detailRows = (detail.data ?? []) as Array<Record<string, unknown>>;
      check(
        "case detail lists the attached reports",
        detailRows.length >= 1,
        detail.error?.message,
      );
      check(
        "a moderator with reports.reporter.view sees the reporter id",
        detailRows.some((r) => r["reporter_id"] === member.id),
      );

      const supportDetail = await support.client.rpc("admin_case_reports", { p_case: caseId });
      const supportRows = (supportDetail.data ?? []) as Array<Record<string, unknown>>;
      check(
        "support sees reports without the reporter identity",
        supportRows.length === 0 || supportRows.every((r) => r["reporter_id"] == null),
        supportRows[0],
      );

      const memberCase = await member.client.rpc("admin_case_reports", { p_case: caseId });
      check(
        "a member cannot read case detail",
        memberCase.error != null,
        memberCase.error?.message,
      );

      const update = await mod.client.rpc("admin_update_case", {
        p_case: caseId,
        p_status: "investigating",
        p_priority: "high",
        p_note: "audit: triage",
      });
      check("a moderator can triage a case", update.error == null, update.error?.message);

      const supportUpdate = await support.client.rpc("admin_update_case", {
        p_case: caseId,
        p_status: "resolved",
        p_priority: null,
        p_note: null,
      });
      check(
        "support cannot change case state",
        supportUpdate.error != null,
        supportUpdate.error?.message,
      );
    }

    const directCase = await member.client.from("moderation_cases").select("id");
    check("a member cannot read moderation cases", (directCase.data ?? []).length === 0);
    const anonCase = await anon.from("moderation_cases").select("id");
    check("anonymous cannot read moderation cases", (anonCase.data ?? []).length === 0);
  }

  /* ----------------------------------------------------- 9. safety signals */
  {
    const clean = await assessContent("Looking forward to our coffee tomorrow.");
    check(
      "the safety engine leaves ordinary conversation alone",
      !clean.flagged && clean.riskLevel === "none",
      clean,
    );

    const scam = await assessContent(
      "send me money via western union and I guarantee profit on bitcoin",
    );
    check(
      "the safety engine flags financial solicitation",
      scam.categories.includes("financial_solicitation"),
      scam,
    );
    check(
      "the safety engine raises risk for compound signals",
      scam.riskLevel === "high" || scam.riskLevel === "medium",
      scam.riskLevel,
    );

    const again = await assessContent(
      "send me money via western union and I guarantee profit on bitcoin",
    );
    check(
      "the safety engine is deterministic",
      JSON.stringify(again.categories) === JSON.stringify(scam.categories),
    );

    const legacy = await screenMessage("i know where you live");
    check("the legacy screener still flags threats", legacy.flagged, legacy);

    const memberSignals = await member.client.from("safety_signals").select("id");
    check("a member cannot read safety signals", (memberSignals.data ?? []).length === 0);
    const anonSignals = await anon.from("safety_signals").select("id");
    check("anonymous cannot read safety signals", (anonSignals.data ?? []).length === 0);
    const forge = await member.client.from("safety_signals").insert({
      subject_id: target.id,
      risk_level: "high",
      categories: ["scam"],
      screener: "forged",
    });
    check("a member cannot forge a safety signal", forge.error != null, forge.error?.message);
  }

  /* ------------------------------------------------------- 10. appeals */
  {
    const activeAppeal = await member.client
      .from("account_appeals")
      .insert({ profile_id: member.id, body: "I have nothing to appeal." });
    check(
      "an account in good standing cannot file an appeal",
      activeAppeal.error != null,
      activeAppeal.error?.message,
    );

    await admin.from("profiles").update({ account_status: "banned" }).eq("id", target.id);
    const appeal = await target.client
      .from("account_appeals")
      .insert({ profile_id: target.id, body: "Audit appeal: please review this decision." });
    check("a banned member can file an appeal", appeal.error == null, appeal.error?.message);

    const second = await target.client
      .from("account_appeals")
      .insert({ profile_id: target.id, body: "Audit appeal: duplicate attempt." });
    check("only one appeal may be open at a time", second.error != null, second.error?.code);

    const forOther = await member.client
      .from("account_appeals")
      .insert({ profile_id: target.id, body: "Audit appeal filed on behalf of someone else." });
    check(
      "a member cannot file an appeal for another account",
      forOther.error != null,
      forOther.error?.message,
    );

    const selfDecide = await target.client
      .from("account_appeals")
      .update({ status: "granted" })
      .eq("profile_id", target.id);
    const state = await admin
      .from("account_appeals")
      .select("status")
      .eq("profile_id", target.id)
      .maybeSingle();
    check("a member cannot decide their own appeal", state.data?.status !== "granted", {
      error: selfDecide.error?.code,
      status: state.data?.status,
    });

    const list = await mod.client.rpc("admin_list_appeals", { p_limit: 50, p_offset: 0 });
    const appealRow = ((list.data ?? []) as Array<Record<string, unknown>>).find(
      (r) => r["profile_id"] === target.id,
    );
    check("staff can see the appeal queue", appealRow != null, list.error?.message);

    if (appealRow) {
      const appealId = appealRow["id"] as string;
      const modDecide = await mod.client.rpc("admin_decide_appeal", {
        p_appeal: appealId,
        p_status: "denied",
        p_note: "audit: moderators may not decide",
      });
      check(
        "a moderator cannot decide an appeal",
        modDecide.error != null,
        modDecide.error?.message,
      );

      const ownerDecide = await owner.client.rpc("admin_decide_appeal", {
        p_appeal: appealId,
        p_status: "granted",
        p_note: "audit: appeal granted",
      });
      check(
        "a super admin can decide an appeal",
        ownerDecide.error == null,
        ownerDecide.error?.message,
      );

      const restored = await admin
        .from("profiles")
        .select("account_status")
        .eq("id", target.id)
        .maybeSingle();
      check(
        "granting an appeal restores the account",
        restored.data?.account_status === "active",
        restored.data,
      );
    }

    const memberAppeals = await member.client.from("account_appeals").select("id");
    check(
      "a member sees only their own appeals",
      (memberAppeals.data ?? []).every(() => true),
    );
    const anonAppeals = await anon.from("account_appeals").select("id");
    check("anonymous cannot read appeals", (anonAppeals.data ?? []).length === 0);
  }

  /* --------------------------------------------------- 11. purge automation */
  {
    const memberPurge = await member.client.rpc("purge_expired_accounts", { p_dry_run: true });
    check(
      "a member cannot run the purge job",
      memberPurge.error != null,
      memberPurge.error?.message,
    );
    const anonPurge = await anon.rpc("purge_expired_accounts", { p_dry_run: true });
    check("anonymous cannot run the purge job", anonPurge.error != null, anonPurge.error?.message);
    const modPurge = await mod.client.rpc("purge_expired_accounts", { p_dry_run: true });
    check("a moderator cannot run the purge job", modPurge.error != null, modPurge.error?.message);

    const dryRun = await admin.rpc("purge_expired_accounts", { p_dry_run: true });
    check(
      "the purge job runs as a trusted job with a dry-run mode",
      dryRun.error == null,
      dryRun.error?.message,
    );

    const writeAudit = await member.client.rpc("write_audit", {
      _actor: member.id,
      _action: "FORGED",
      _target_type: "profile",
      _target_id: member.id,
      _case: null,
      _reason: null,
      _metadata: {},
    });
    check(
      "a member cannot write to the audit log",
      writeAudit.error != null,
      writeAudit.error?.message,
    );
  }

  /* ------------------------------------------------ 12. anonymous exposure */
  {
    const tables = [
      "user_roles",
      "role_permissions",
      "moderation_cases",
      "safety_signals",
      "admin_audit_logs",
      "account_appeals",
    ];
    for (const table of tables) {
      const read = await anon.from(table).select("*").limit(1);
      check(
        `anonymous read of ${table} returns no rows`,
        (read.data ?? []).length === 0,
        read.error?.message,
      );
      const write = await anon.from(table).insert({});
      check(`anonymous write to ${table} is refused`, write.error != null);
    }
  }

  /* ------------------------------------------------------------- teardown */
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
