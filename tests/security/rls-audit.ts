/**
 * LYVE Phase 1 — database security test suite.
 *
 * Verifies at the DATABASE level (not the UI) that:
 *  - user A can never read or write user B's rows,
 *  - anonymous callers can never read private data or private storage objects,
 *  - the 18+ age gate cannot be bypassed by calling the API directly,
 *  - onboarding state and photos are owner-scoped,
 *  - soft-deleted accounts stay owner-visible only.
 *
 * Run:  bun run tests/security/rls-audit.ts
 * Requires SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SERVICE_ROLE_KEY
 * in the environment. The service role key is used ONLY to create and remove
 * the two throwaway test accounts — never by the application itself.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
const users = {
  a: { email: `audit-a-${stamp}@lyve.test`, password: `Aud1t-pass-${stamp}` },
  b: { email: `audit-b-${stamp}@lyve.test`, password: `Aud1t-pass-${stamp}` },
};

async function createUser(email: string, password: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  return data.user!.id;
}

async function signIn(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(url, publishableKey, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

async function main() {
  const idA = await createUser(users.a.email, users.a.password);
  const idB = await createUser(users.b.email, users.b.password);
  const clientA = await signIn(users.a.email, users.a.password);
  const clientB = await signIn(users.b.email, users.b.password);

  try {
    /* ---------------------------------------------------- age gate (server) */
    const dob = (yearsAgo: number, extraDays = 0) => {
      const date = new Date();
      date.setFullYear(date.getFullYear() - yearsAgo);
      date.setDate(date.getDate() + extraDays);
      return date.toISOString().slice(0, 10);
    };

    const insertA = await clientA
      .from("profiles")
      .insert({ id: idA, date_of_birth: dob(18, 1) }) // 17 years 364 days
      .select();
    check(
      "age gate: 17y364d insert rejected by database",
      Boolean(insertA.error),
      insertA.error?.message,
    );

    const exact18 = await clientA
      .from("profiles")
      .insert({ id: idA, date_of_birth: dob(18) })
      .select();
    check("age gate: exactly 18 accepted", !exact18.error, exact18.error?.message);

    const future = await clientA
      .from("profiles")
      .update({ date_of_birth: dob(-1) })
      .eq("id", idA)
      .select();
    check("age gate: future date rejected", Boolean(future.error), future.error?.message);

    const ancient = await clientA
      .from("profiles")
      .update({ date_of_birth: dob(150) })
      .eq("id", idA)
      .select();
    check("age gate: impossible date rejected", Boolean(ancient.error), ancient.error?.message);

    const downgrade = await clientA
      .from("profiles")
      .update({ date_of_birth: dob(16) })
      .eq("id", idA)
      .select();
    check(
      "age gate: cannot later set an underage date",
      Boolean(downgrade.error),
      downgrade.error?.message,
    );

    await clientB.from("profiles").insert({ id: idB, date_of_birth: dob(30), first_name: "Bee" });
    await clientB.from("preferences").insert({ profile_id: idB });
    await clientB.from("privacy_settings").insert({ profile_id: idB });
    await clientB.from("onboarding_progress").insert({ profile_id: idB });

    /* ------------------------------------------- cross-user read protection */
    const readProfile = await clientA.from("profiles").select("*").eq("id", idB);
    check("A cannot read B's profile", (readProfile.data ?? []).length === 0, readProfile.data);

    const readPrefs = await clientA.from("preferences").select("*").eq("profile_id", idB);
    check("A cannot read B's preferences", (readPrefs.data ?? []).length === 0, readPrefs.data);

    const readPrivacy = await clientA.from("privacy_settings").select("*").eq("profile_id", idB);
    check(
      "A cannot read B's privacy settings",
      (readPrivacy.data ?? []).length === 0,
      readPrivacy.data,
    );

    const readOnboarding = await clientA
      .from("onboarding_progress")
      .select("*")
      .eq("profile_id", idB);
    check(
      "A cannot read B's onboarding state",
      (readOnboarding.data ?? []).length === 0,
      readOnboarding.data,
    );

    const readDeletion = await clientA
      .from("account_deletion_requests")
      .select("*")
      .eq("profile_id", idB);
    check(
      "A cannot read B's deletion requests",
      (readDeletion.data ?? []).length === 0,
      readDeletion.data,
    );

    /* ------------------------------------------ cross-user write protection */
    const writeProfile = await clientA
      .from("profiles")
      .update({ first_name: "hacked" })
      .eq("id", idB)
      .select();
    check("A cannot modify B's profile", (writeProfile.data ?? []).length === 0, writeProfile.data);

    const writePrefs = await clientA
      .from("preferences")
      .update({ min_age: 18, max_age: 99 })
      .eq("profile_id", idB)
      .select();
    check("A cannot modify B's preferences", (writePrefs.data ?? []).length === 0, writePrefs.data);

    const writePrivacy = await clientA
      .from("privacy_settings")
      .update({ discoverable: true, profile_visibility: "everyone" })
      .eq("profile_id", idB)
      .select();
    check(
      "A cannot modify B's privacy settings",
      (writePrivacy.data ?? []).length === 0,
      writePrivacy.data,
    );

    const forgeProfile = await clientA
      .from("profiles")
      .insert({ id: idB, first_name: "forged" })
      .select();
    check(
      "A cannot submit profile data as B",
      Boolean(forgeProfile.error),
      forgeProfile.error?.message,
    );

    const forgeOnboarding = await clientA
      .from("onboarding_progress")
      .update({ is_complete: true })
      .eq("profile_id", idB)
      .select();
    check(
      "A cannot mark B's onboarding complete",
      (forgeOnboarding.data ?? []).length === 0,
      forgeOnboarding.data,
    );

    const forgeInterest = await clientA
      .from("profile_interests")
      .insert({ profile_id: idB, interest_id: (await anonInterestId()) ?? "" })
      .select();
    check(
      "A cannot add interests to B",
      Boolean(forgeInterest.error),
      forgeInterest.error?.message,
    );

    const forgeDeletion = await clientA
      .from("account_deletion_requests")
      .insert({ profile_id: idB })
      .select();
    check(
      "A cannot request deletion of B's account",
      Boolean(forgeDeletion.error),
      forgeDeletion.error?.message,
    );

    /* --------------------------------------------------------- photo + storage */
    const bytes = new Uint8Array([255, 216, 255, 219, 0, 0, 0, 0]);
    const pathB = `${idB}/audit-${stamp}.jpg`;
    const uploadB = await clientB.storage
      .from("profile-photos")
      .upload(pathB, bytes, { contentType: "image/jpeg" });
    check("B can upload to their own folder", !uploadB.error, uploadB.error?.message);

    const photoRow = await clientB
      .from("profile_photos")
      .insert({ profile_id: idB, storage_path: pathB, display_order: 0, is_primary: true })
      .select()
      .single();
    check("B owns a photo row", !photoRow.error, photoRow.error?.message);

    const crossUpload = await clientA.storage
      .from("profile-photos")
      .upload(`${idB}/intruder-${stamp}.jpg`, bytes, { contentType: "image/jpeg" });
    check(
      "A cannot upload into B's storage folder",
      Boolean(crossUpload.error),
      crossUpload.error?.message,
    );

    const crossDownload = await clientA.storage.from("profile-photos").download(pathB);
    check(
      "A cannot download B's photo",
      Boolean(crossDownload.error),
      crossDownload.error?.message,
    );

    const crossSign = await clientA.storage.from("profile-photos").createSignedUrl(pathB, 60);
    check("A cannot sign a URL for B's photo", Boolean(crossSign.error), crossSign.error?.message);

    const crossRemove = await clientA.storage.from("profile-photos").remove([pathB]);
    const stillThere = await admin.storage.from("profile-photos").download(pathB);
    check("A cannot delete B's storage object", !stillThere.error, crossRemove.error?.message);

    if (photoRow.data) {
      const deleteRow = await clientA
        .from("profile_photos")
        .delete()
        .eq("id", photoRow.data.id)
        .select();
      check("A cannot delete B's photo row", (deleteRow.data ?? []).length === 0, deleteRow.data);
    }

    const anonDownload = await anon.storage.from("profile-photos").download(pathB);
    check(
      "anonymous cannot download private photos",
      Boolean(anonDownload.error),
      anonDownload.error?.message,
    );

    const badMime = await clientB.storage
      .from("profile-photos")
      .upload(`${idB}/payload-${stamp}.html`, new Blob(["<script>x</script>"]), {
        contentType: "text/html",
      });
    check("storage rejects non-image file types", Boolean(badMime.error), badMime.error?.message);

    const disguised = await clientB.storage
      .from("profile-photos")
      .upload(`${idB}/payload-${stamp}.svg`, new Blob(["<svg onload=alert(1)>"]), {
        contentType: "image/svg+xml",
      });
    check(
      "storage rejects scriptable SVG uploads",
      Boolean(disguised.error),
      disguised.error?.message,
    );

    /* --------------------------------------------------------- anonymous access */
    for (const table of [
      "profiles",
      "preferences",
      "privacy_settings",
      "profile_photos",
      "profile_interests",
      "onboarding_progress",
      "account_deletion_requests",
      "interests",
    ] as const) {
      const result = await anon.from(table).select("*").limit(5);
      check(`anonymous cannot read ${table}`, (result.data ?? []).length === 0, result.data);
    }

    const anonWrite = await anon.from("profiles").insert({ id: idB, first_name: "anon" }).select();
    check("anonymous cannot insert a profile", Boolean(anonWrite.error), anonWrite.error?.message);

    /* ------------------------------------------------------------- soft delete */
    const deletion = await clientB
      .from("account_deletion_requests")
      .insert({ profile_id: idB })
      .select()
      .single();
    check("B can request their own deletion", !deletion.error, deletion.error?.message);

    await clientB.from("profiles").update({ deleted_at: new Date().toISOString() }).eq("id", idB);
    const deletedVisibleToA = await clientA.from("profiles").select("id").eq("id", idB);
    check(
      "soft-deleted profile invisible to other users",
      (deletedVisibleToA.data ?? []).length === 0,
    );

    const deletedVisibleToAnon = await anon.from("profiles").select("id").eq("id", idB);
    check(
      "soft-deleted profile invisible to anonymous",
      (deletedVisibleToAnon.data ?? []).length === 0,
    );

    if (deletion.data) {
      const tamper = await clientB
        .from("account_deletion_requests")
        .update({ scheduled_purge_at: new Date(Date.now() + 5 * 365 * 86400000).toISOString() })
        .eq("id", deletion.data.id)
        .select()
        .single();
      check(
        "purge date cannot be pushed out by the account owner",
        tamper.data?.scheduled_purge_at === deletion.data.scheduled_purge_at,
        tamper.data?.scheduled_purge_at,
      );

      const forceComplete = await clientB
        .from("account_deletion_requests")
        .update({ status: "completed" })
        .eq("id", deletion.data.id)
        .select();
      check(
        "owner cannot mark their deletion request completed",
        Boolean(forceComplete.error),
        forceComplete.error?.message,
      );

      const cancel = await clientB
        .from("account_deletion_requests")
        .update({ status: "cancelled" })
        .eq("id", deletion.data.id)
        .select()
        .single();
      check("owner can cancel their own deletion request", !cancel.error, cancel.error?.message);
    }

    /* ------------------------------------------------------------ expired token */
    const expired = createClient(url, publishableKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: "Bearer invalid.token.value" } },
    });
    const expiredRead = await expired.from("profiles").select("*").limit(1);
    check(
      "invalid/expired token is rejected",
      Boolean(expiredRead.error),
      expiredRead.error?.message,
    );
  } finally {
    await admin.storage
      .from("profile-photos")
      .remove([`${idA}/`, `${idB}/`])
      .catch(() => undefined);
    const { data: objects } = await admin.storage.from("profile-photos").list(idB);
    if (objects?.length) {
      await admin.storage.from("profile-photos").remove(objects.map((o) => `${idB}/${o.name}`));
    }
    await admin.auth.admin.deleteUser(idA);
    await admin.auth.admin.deleteUser(idB);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

async function anonInterestId(): Promise<string | null> {
  const { data } = await admin.from("interests").select("id").limit(1).maybeSingle();
  return data?.id ?? null;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
