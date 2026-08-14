/**
 * JWS / JWT primitives for real store integrations. SERVER ONLY.
 *
 * Everything here fails closed: an unparsable token, an unexpected algorithm,
 * an untrusted chain or an expired certificate is a rejection, never a
 * "probably fine". No token, key or payload is ever logged.
 *
 * Covers:
 *   - Apple ASSN V2 / StoreKit signed payloads (ES256 with an `x5c` chain
 *     anchored to Apple Root CA - G3)
 *   - App Store Server API client JWT (ES256, .p8 key)
 *   - Google service-account JWT + OIDC push token (RS256, JWKS)
 */
import {
  certificateSignedBy,
  importEcPublicKey,
  parseCertificate,
  sameBytes,
  sha256Hex,
  type Certificate,
} from "./x509.server";

/** SHA-256 fingerprint of Apple Root CA - G3 (the ASSN V2 trust anchor). */
export const APPLE_ROOT_CA_G3_FINGERPRINT =
  "63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179";

export function b64uToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export function bytesToB64u(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64u(value: string): string {
  return bytesToB64u(new TextEncoder().encode(value));
}

function b64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export type JwsParts = {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signingInput: Uint8Array;
  signature: Uint8Array;
};

/** Structural decode ONLY. The result is untrusted until verified. */
export function decodeJws(token: string): JwsParts | null {
  const segments = token.split(".");
  if (segments.length !== 3) return null;
  try {
    const header = JSON.parse(new TextDecoder().decode(b64uToBytes(segments[0]!))) as Record<string, unknown>;
    const payload = JSON.parse(new TextDecoder().decode(b64uToBytes(segments[1]!))) as Record<string, unknown>;
    if (!header || typeof header !== "object" || !payload || typeof payload !== "object") return null;
    return {
      header,
      payload,
      signingInput: new TextEncoder().encode(`${segments[0]}.${segments[1]}`),
      signature: b64uToBytes(segments[2]!),
    };
  } catch {
    return null;
  }
}

export type JwsFailure =
  | "MALFORMED"
  | "UNSUPPORTED_ALG"
  | "MISSING_CHAIN"
  | "UNTRUSTED_ROOT"
  | "BROKEN_CHAIN"
  | "CERT_EXPIRED"
  | "BAD_SIGNATURE";

export type JwsResult<T> = { ok: true; payload: T } | { ok: false; reason: JwsFailure };

/**
 * Verifies an Apple-signed JWS: ES256, full `x5c` chain, every link checked,
 * every certificate inside its validity window, root pinned by fingerprint.
 */
export async function verifyAppleJws<T = Record<string, unknown>>(
  token: string,
  options: { trustedRootFingerprints?: readonly string[]; now?: Date } = {},
): Promise<JwsResult<T>> {
  const parts = decodeJws(token);
  if (!parts) return { ok: false, reason: "MALFORMED" };
  if (parts.header["alg"] !== "ES256") return { ok: false, reason: "UNSUPPORTED_ALG" };

  const x5c = parts.header["x5c"];
  if (!Array.isArray(x5c) || x5c.length < 2 || x5c.some((c) => typeof c !== "string")) {
    return { ok: false, reason: "MISSING_CHAIN" };
  }

  let chain: Certificate[];
  try {
    chain = (x5c as string[]).map((entry) => parseCertificate(b64ToBytes(entry)));
  } catch {
    return { ok: false, reason: "MALFORMED" };
  }

  const now = options.now ?? new Date();
  for (const cert of chain) {
    if (now < cert.notBefore || now > cert.notAfter) return { ok: false, reason: "CERT_EXPIRED" };
  }

  const root = chain[chain.length - 1]!;
  const trusted = options.trustedRootFingerprints ?? [APPLE_ROOT_CA_G3_FINGERPRINT];
  const rootFingerprint = await sha256Hex(root.der);
  if (!trusted.includes(rootFingerprint)) return { ok: false, reason: "UNTRUSTED_ROOT" };
  // A self-signed root must actually be self-signed.
  if (!sameBytes(root.issuerDer, root.subjectDer)) return { ok: false, reason: "BROKEN_CHAIN" };
  if (!(await certificateSignedBy(root, root))) return { ok: false, reason: "BROKEN_CHAIN" };

  for (let i = 0; i < chain.length - 1; i += 1) {
    const child = chain[i]!;
    const parent = chain[i + 1]!;
    if (!sameBytes(child.issuerDer, parent.subjectDer)) return { ok: false, reason: "BROKEN_CHAIN" };
    if (!(await certificateSignedBy(child, parent))) return { ok: false, reason: "BROKEN_CHAIN" };
  }

  const leafKey = await importEcPublicKey(chain[0]!);
  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    leafKey,
    parts.signature as unknown as ArrayBuffer,
    parts.signingInput as unknown as ArrayBuffer,
  );
  if (!valid) return { ok: false, reason: "BAD_SIGNATURE" };

  return { ok: true, payload: parts.payload as T };
}

/* ------------------------------------------------------------------ */
/* Signing (outbound calls to the store APIs)                          */
/* ------------------------------------------------------------------ */

function pemBody(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN [A-Z ]+-----/g, "")
    .replace(/-----END [A-Z ]+-----/g, "")
    .replace(/\s+/g, "");
  return b64ToBytes(body);
}

/** App Store Server API client assertion (ES256, Apple .p8 key). */
export async function signAppleClientJwt(input: {
  privateKeyPem: string;
  keyId: string;
  issuerId: string;
  bundleId: string;
  now?: number;
  ttlSeconds?: number;
}): Promise<string> {
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemBody(input.privateKeyPem) as unknown as ArrayBuffer,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const issuedAt = Math.floor((input.now ?? Date.now()) / 1000);
  const header = b64u(JSON.stringify({ alg: "ES256", kid: input.keyId, typ: "JWT" }));
  const payload = b64u(
    JSON.stringify({
      iss: input.issuerId,
      iat: issuedAt,
      exp: issuedAt + Math.min(input.ttlSeconds ?? 900, 3600),
      aud: "appstoreconnect-v1",
      bid: input.bundleId,
    }),
  );
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(`${header}.${payload}`) as unknown as ArrayBuffer,
  );
  return `${header}.${payload}.${bytesToB64u(new Uint8Array(signature))}`;
}

/** Google service-account assertion (RS256) exchanged for an access token. */
export async function signGoogleServiceJwt(input: {
  privateKeyPem: string;
  clientEmail: string;
  scope: string;
  now?: number;
}): Promise<string> {
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemBody(input.privateKeyPem) as unknown as ArrayBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const issuedAt = Math.floor((input.now ?? Date.now()) / 1000);
  const header = b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64u(
    JSON.stringify({
      iss: input.clientEmail,
      scope: input.scope,
      aud: "https://oauth2.googleapis.com/token",
      iat: issuedAt,
      exp: issuedAt + 3600,
    }),
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${header}.${payload}`) as unknown as ArrayBuffer,
  );
  return `${header}.${payload}.${bytesToB64u(new Uint8Array(signature))}`;
}

/* ------------------------------------------------------------------ */
/* Google Pub/Sub OIDC push-token verification                          */
/* ------------------------------------------------------------------ */

export type OidcClaims = { aud?: unknown; email?: unknown; email_verified?: unknown; exp?: unknown; iss?: unknown };

export type OidcFailure =
  | "MALFORMED"
  | "UNSUPPORTED_ALG"
  | "UNKNOWN_KEY"
  | "BAD_SIGNATURE"
  | "EXPIRED"
  | "WRONG_ISSUER"
  | "WRONG_AUDIENCE"
  | "WRONG_PRINCIPAL";

const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

/**
 * Verifies a Google Pub/Sub push OIDC token against a supplied JWKS.
 * The JWKS is injected so this stays deterministic and offline-testable.
 */
export async function verifyGoogleOidcToken(
  token: string,
  options: {
    jwks: { keys: Array<Record<string, unknown>> };
    audience: string;
    serviceAccountEmail: string;
    now?: number;
  },
): Promise<{ ok: true; claims: OidcClaims } | { ok: false; reason: OidcFailure }> {
  const parts = decodeJws(token);
  if (!parts) return { ok: false, reason: "MALFORMED" };
  if (parts.header["alg"] !== "RS256") return { ok: false, reason: "UNSUPPORTED_ALG" };

  const kid = parts.header["kid"];
  const jwk = options.jwks.keys.find((entry) => entry["kid"] === kid && entry["kty"] === "RSA");
  if (!jwk) return { ok: false, reason: "UNKNOWN_KEY" };

  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      "jwk",
      { kty: "RSA", n: String(jwk["n"]), e: String(jwk["e"]), alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
  } catch {
    return { ok: false, reason: "UNKNOWN_KEY" };
  }

  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    parts.signature as unknown as ArrayBuffer,
    parts.signingInput as unknown as ArrayBuffer,
  );
  if (!valid) return { ok: false, reason: "BAD_SIGNATURE" };

  const claims = parts.payload as OidcClaims;
  const now = Math.floor((options.now ?? Date.now()) / 1000);
  if (typeof claims.exp !== "number" || claims.exp <= now) return { ok: false, reason: "EXPIRED" };
  if (typeof claims.iss !== "string" || !GOOGLE_ISSUERS.includes(claims.iss)) {
    return { ok: false, reason: "WRONG_ISSUER" };
  }
  if (claims.aud !== options.audience) return { ok: false, reason: "WRONG_AUDIENCE" };
  if (claims.email !== options.serviceAccountEmail || claims.email_verified !== true) {
    return { ok: false, reason: "WRONG_PRINCIPAL" };
  }
  return { ok: true, claims };
}
