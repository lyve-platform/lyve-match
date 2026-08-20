/**
 * Store credential + environment resolution. SERVER ONLY.
 *
 * Two rules make this fail closed:
 *   1. The deployment declares ONE environment (`LYVE_STORE_ENVIRONMENT`,
 *      default `sandbox`). Credentials for the other environment being present
 *      is a misconfiguration, not a fallback — we refuse to run rather than
 *      silently verify sandbox purchases with production trust, or vice versa.
 *   2. A partially configured store is NOT configured. A missing key never
 *      degrades into "trust the client".
 *
 * Sandbox and production credentials live under different names so a sandbox
 * key can never be mistaken for a production one.
 */

export type StoreEnv = "sandbox" | "production";

export type ConfigFailure = "NOT_CONFIGURED" | "CREDENTIAL_MISPLACED" | "INVALID_CREDENTIAL";
export type ConfigResult<T> = { ok: true; config: T } | { ok: false; reason: ConfigFailure };

export type AppleConfig = {
  environment: StoreEnv;
  issuerId: string;
  keyId: string;
  privateKeyPem: string;
  bundleId: string;
  apiBase: string;
  trustedRootFingerprints: readonly string[];
};

export type GoogleConfig = {
  environment: StoreEnv;
  clientEmail: string;
  privateKeyPem: string;
  packageName: string;
  apiBase: string;
  /** Pub/Sub push OIDC expectations for the RTDN endpoint. */
  pushAudience: string | null;
  pushServiceAccountEmail: string | null;
};

const APPLE_SANDBOX_API = "https://api.storekit-sandbox.itunes.apple.com";
const APPLE_PRODUCTION_API = "https://api.storekit.itunes.apple.com";
const GOOGLE_API = "https://androidpublisher.googleapis.com";

const APPLE_SANDBOX_VARS = [
  "APPLE_IAP_SANDBOX_ISSUER_ID",
  "APPLE_IAP_SANDBOX_KEY_ID",
  "APPLE_IAP_SANDBOX_PRIVATE_KEY",
  "APPLE_IAP_SANDBOX_BUNDLE_ID",
] as const;
const APPLE_PRODUCTION_VARS = [
  "APPSTORE_ISSUER_ID",
  "APPSTORE_KEY_ID",
  "APPSTORE_PRIVATE_KEY",
  "APPSTORE_BUNDLE_ID",
  "APPLE_IAP_ISSUER_ID",
  "APPLE_IAP_KEY_ID",
  "APPLE_IAP_PRIVATE_KEY",
  "APPLE_IAP_BUNDLE_ID",
] as const;
const GOOGLE_SANDBOX_VARS = [
  "GOOGLE_PLAY_SANDBOX_SERVICE_ACCOUNT_JSON",
  "GOOGLE_PLAY_SANDBOX_PACKAGE_NAME",
] as const;
const GOOGLE_PRODUCTION_VARS = [
  "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON",
  "GOOGLE_PLAY_PACKAGE_NAME",
] as const;

function env(name: string): string | null {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function anyPresent(names: readonly string[]): boolean {
  return names.some((name) => env(name) !== null);
}

export function configuredStoreEnvironment(): StoreEnv {
  return env("LYVE_STORE_ENVIRONMENT") === "production" ? "production" : "sandbox";
}

/** True when credentials for the environment we are NOT running as exist. */
export function hasMisplacedAppleCredentials(): boolean {
  return configuredStoreEnvironment() === "sandbox"
    ? anyPresent(APPLE_PRODUCTION_VARS)
    : anyPresent(APPLE_SANDBOX_VARS);
}

export function hasMisplacedGoogleCredentials(): boolean {
  return configuredStoreEnvironment() === "sandbox"
    ? anyPresent(GOOGLE_PRODUCTION_VARS)
    : anyPresent(GOOGLE_SANDBOX_VARS);
}

/**
 * Test-only trust anchors. Accepted ONLY in a sandbox deployment, so a
 * production deployment can never be pointed at an attacker-chosen root.
 */
export function appleTrustedRoots(): readonly string[] {
  const overrides = env("APPLE_SANDBOX_ROOT_FINGERPRINTS");
  if (configuredStoreEnvironment() !== "sandbox" || !overrides) return [];
  return overrides
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => /^[0-9a-f]{64}$/.test(value));
}

export function appleConfig(): ConfigResult<AppleConfig> {
  if (hasMisplacedAppleCredentials()) return { ok: false, reason: "CREDENTIAL_MISPLACED" };
  const environment = configuredStoreEnvironment();

  const issuerId =
    environment === "production"
      ? (env("APPSTORE_ISSUER_ID") ?? env("APPLE_IAP_ISSUER_ID"))
      : env("APPLE_IAP_SANDBOX_ISSUER_ID");
  const keyId =
    environment === "production"
      ? (env("APPSTORE_KEY_ID") ?? env("APPLE_IAP_KEY_ID"))
      : env("APPLE_IAP_SANDBOX_KEY_ID");
  const privateKeyPem =
    environment === "production"
      ? (env("APPSTORE_PRIVATE_KEY") ?? env("APPLE_IAP_PRIVATE_KEY"))
      : env("APPLE_IAP_SANDBOX_PRIVATE_KEY");
  const bundleId =
    environment === "production"
      ? (env("APPSTORE_BUNDLE_ID") ?? env("APPLE_IAP_BUNDLE_ID"))
      : env("APPLE_IAP_SANDBOX_BUNDLE_ID");

  if (!issuerId && !keyId && !privateKeyPem && !bundleId)
    return { ok: false, reason: "NOT_CONFIGURED" };
  if (!issuerId || !keyId || !privateKeyPem || !bundleId)
    return { ok: false, reason: "NOT_CONFIGURED" };
  if (!privateKeyPem.includes("PRIVATE KEY")) return { ok: false, reason: "INVALID_CREDENTIAL" };

  return {
    ok: true,
    config: {
      environment,
      issuerId,
      keyId,
      privateKeyPem,
      bundleId,
      apiBase: environment === "sandbox" ? APPLE_SANDBOX_API : APPLE_PRODUCTION_API,
      trustedRootFingerprints: appleTrustedRoots(),
    },
  };
}

export function googleConfig(): ConfigResult<GoogleConfig> {
  if (hasMisplacedGoogleCredentials()) return { ok: false, reason: "CREDENTIAL_MISPLACED" };
  const environment = configuredStoreEnvironment();
  const [jsonName, packageName] =
    environment === "sandbox" ? GOOGLE_SANDBOX_VARS : GOOGLE_PRODUCTION_VARS;
  const raw = env(jsonName);
  const pkg = env(packageName);
  if (!raw && !pkg) return { ok: false, reason: "NOT_CONFIGURED" };
  if (!raw || !pkg) return { ok: false, reason: "NOT_CONFIGURED" };

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { ok: false, reason: "INVALID_CREDENTIAL" };
  }
  const clientEmail = typeof parsed["client_email"] === "string" ? parsed["client_email"] : null;
  const privateKeyPem = typeof parsed["private_key"] === "string" ? parsed["private_key"] : null;
  if (!clientEmail || !privateKeyPem || !privateKeyPem.includes("PRIVATE KEY")) {
    return { ok: false, reason: "INVALID_CREDENTIAL" };
  }

  const prefix = environment === "sandbox" ? "GOOGLE_RTDN_SANDBOX" : "GOOGLE_RTDN";
  return {
    ok: true,
    config: {
      environment,
      clientEmail,
      privateKeyPem,
      packageName: pkg,
      apiBase: GOOGLE_API,
      pushAudience: env(`${prefix}_AUDIENCE`),
      pushServiceAccountEmail: env(`${prefix}_SERVICE_ACCOUNT_EMAIL`),
    },
  };
}

/**
 * Which verification rail a store runs on right now.
 *   `api`  — real store API + real signature verification
 *   `hmac` — the internal sandbox test rail (no store credentials)
 *   `none` — nothing is trusted; every request is refused
 */
export type StoreRail = "api" | "hmac" | "none";

export function appleRail(): StoreRail {
  const config = appleConfig();
  if (config.ok) return "api";
  if (config.reason === "NOT_CONFIGURED" && configuredStoreEnvironment() === "sandbox")
    return "hmac";
  return "none";
}

export function googleRail(): StoreRail {
  const config = googleConfig();
  if (config.ok) return "api";
  if (config.reason === "NOT_CONFIGURED" && configuredStoreEnvironment() === "sandbox")
    return "hmac";
  return "none";
}
