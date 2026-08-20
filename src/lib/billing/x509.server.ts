/**
 * Minimal DER / X.509 reader used by Apple JWS (ASSN V2 `x5c`) verification.
 * SERVER ONLY. Parsing only — it never trusts, decides or grants anything.
 *
 * Scope is deliberately tiny: enough to walk a certificate chain, check each
 * link's ECDSA signature, read validity dates and fingerprint the root.
 * Anything unusual throws, which the caller turns into a fail-closed reject.
 */

export type DerNode = {
  tag: number;
  start: number;
  contentStart: number;
  end: number;
};

export function readNode(bytes: Uint8Array, offset: number): DerNode {
  const tag = bytes[offset]!;
  let index = offset + 1;
  let length = bytes[index]!;
  index += 1;
  if (length & 0x80) {
    const count = length & 0x7f;
    if (count === 0 || count > 4) throw new Error("DER_LENGTH");
    length = 0;
    for (let i = 0; i < count; i += 1) {
      length = (length << 8) | bytes[index]!;
      index += 1;
    }
  }
  const end = index + length;
  if (end > bytes.length) throw new Error("DER_OVERRUN");
  return { tag, start: offset, contentStart: index, end };
}

function children(bytes: Uint8Array, node: DerNode): DerNode[] {
  const out: DerNode[] = [];
  let cursor = node.contentStart;
  while (cursor < node.end) {
    const child = readNode(bytes, cursor);
    out.push(child);
    cursor = child.end;
  }
  return out;
}

function oid(bytes: Uint8Array, node: DerNode): string {
  const body = bytes.subarray(node.contentStart, node.end);
  const parts: number[] = [Math.floor(body[0]! / 40), body[0]! % 40];
  let value = 0;
  for (let i = 1; i < body.length; i += 1) {
    const byte = body[i]!;
    value = (value << 7) | (byte & 0x7f);
    if (!(byte & 0x80)) {
      parts.push(value);
      value = 0;
    }
  }
  return parts.join(".");
}

function derTime(bytes: Uint8Array, node: DerNode): Date {
  const text = new TextDecoder().decode(bytes.subarray(node.contentStart, node.end));
  // UTCTime (tag 0x17) is YYMMDDHHMMSSZ; GeneralizedTime (0x18) is YYYYMMDDHHMMSSZ.
  const full = node.tag === 0x17 ? `${Number(text.slice(0, 2)) >= 50 ? "19" : "20"}${text}` : text;
  const iso = `${full.slice(0, 4)}-${full.slice(4, 6)}-${full.slice(6, 8)}T${full.slice(8, 10)}:${full.slice(10, 12)}:${full.slice(12, 14)}Z`;
  return new Date(iso);
}

export const OID_ECDSA_SHA256 = "1.2.840.10045.4.3.2";
export const OID_ECDSA_SHA384 = "1.2.840.10045.4.3.3";
export const OID_P256 = "1.2.840.10045.3.1.7";
export const OID_P384 = "1.3.132.0.34";

export type Certificate = {
  der: Uint8Array;
  tbs: Uint8Array;
  /** SubjectPublicKeyInfo, ready for crypto.subtle.importKey("spki", ...). */
  spki: Uint8Array;
  curve: "P-256" | "P-384";
  signatureAlgorithm: string;
  /** Raw (r||s) signature bytes. */
  signature: Uint8Array;
  notBefore: Date;
  notAfter: Date;
  issuerDer: Uint8Array;
  subjectDer: Uint8Array;
};

/** DER ECDSA-Sig-Value {r,s} → fixed-width raw signature for WebCrypto. */
export function derSignatureToRaw(der: Uint8Array, size: number): Uint8Array {
  const seq = readNode(der, 0);
  const [r, s] = children(der, seq);
  if (!r || !s) throw new Error("DER_SIG");
  const out = new Uint8Array(size * 2);
  const copy = (node: DerNode, at: number) => {
    let body = der.subarray(node.contentStart, node.end);
    while (body.length > size && body[0] === 0) body = body.subarray(1);
    if (body.length > size) throw new Error("DER_SIG_LEN");
    out.set(body, at + (size - body.length));
  };
  copy(r, 0);
  copy(s, size);
  return out;
}

export function parseCertificate(der: Uint8Array): Certificate {
  const cert = readNode(der, 0);
  const [tbs, algorithm, signatureBits] = children(der, cert);
  if (!tbs || !algorithm || !signatureBits) throw new Error("X509_SHAPE");

  const algOid = oid(der, children(der, algorithm)[0]!);
  const size = algOid === OID_ECDSA_SHA384 ? 48 : 32;
  // BIT STRING content starts with the unused-bits byte.
  const signature = derSignatureToRaw(
    der.slice(signatureBits.contentStart + 1, signatureBits.end),
    size,
  );

  const tbsParts = children(der, tbs);
  let index = 0;
  if (tbsParts[0]!.tag === 0xa0) index = 1; // explicit version
  index += 1; // serialNumber
  index += 1; // inner signature algorithm
  const issuer = tbsParts[index]!;
  index += 1;
  const validity = tbsParts[index]!;
  index += 1;
  const subject = tbsParts[index]!;
  index += 1;
  const spkiNode = tbsParts[index]!;

  const [notBefore, notAfter] = children(der, validity);
  const spkiParts = children(der, spkiNode);
  const spkiAlg = children(der, spkiParts[0]!);
  const curveOid = spkiAlg[1] ? oid(der, spkiAlg[1]) : OID_P256;

  return {
    der,
    tbs: der.slice(tbs.start, tbs.end),
    spki: der.slice(spkiNode.start, spkiNode.end),
    curve: curveOid === OID_P384 ? "P-384" : "P-256",
    signatureAlgorithm: algOid,
    signature,
    notBefore: derTime(der, notBefore!),
    notAfter: derTime(der, notAfter!),
    issuerDer: der.slice(issuer.start, issuer.end),
    subjectDer: der.slice(subject.start, subject.end),
  };
}

export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function importEcPublicKey(cert: Certificate): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "spki",
    cert.spki as unknown as ArrayBuffer,
    { name: "ECDSA", namedCurve: cert.curve },
    false,
    ["verify"],
  );
}

/** Verifies that `child` was signed by `parent`. */
export async function certificateSignedBy(
  child: Certificate,
  parent: Certificate,
): Promise<boolean> {
  const hash = child.signatureAlgorithm === OID_ECDSA_SHA384 ? "SHA-384" : "SHA-256";
  const key = await importEcPublicKey(parent);
  return crypto.subtle.verify(
    { name: "ECDSA", hash },
    key,
    child.signature as unknown as ArrayBuffer,
    child.tbs as unknown as ArrayBuffer,
  );
}
