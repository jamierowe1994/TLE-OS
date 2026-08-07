import { S3Client } from "@aws-sdk/client-s3";

/**
 * Cloudflare R2, spoken to over the S3 protocol.
 *
 * Two things about R2 that aren't obvious:
 *
 * 1. The region is always "auto". R2 has no regions in the S3 sense — the
 *    bucket's jurisdiction decides where the bytes live, not this string.
 *
 * 2. A bucket created with an EU jurisdiction is NOT reachable on the normal
 *    hostname. It answers on <account>.eu.r2.cloudflarestorage.com, and the
 *    plain host returns a 404-ish error that reads like the bucket doesn't
 *    exist — which sends you hunting for a typo that isn't there.
 *
 * So the endpoint is resolved rather than assumed: R2_ENDPOINT wins if it's
 * set, otherwise both hostnames are tried and whichever answers is used. That
 * makes the setup survive somebody picking a different jurisdiction later.
 */

export const R2_BUCKET = process.env.R2_BUCKET ?? "";

const ACCOUNT = process.env.R2_ACCOUNT_ID ?? "";
const KEY = process.env.R2_ACCESS_KEY_ID ?? "";
const SECRET = process.env.R2_SECRET_ACCESS_KEY ?? "";

/** Every variable present? Says nothing about whether they're correct. */
export const r2Configured = Boolean(ACCOUNT && KEY && SECRET && R2_BUCKET);

/**
 * Confirmed 7 Aug 2026 against the live bucket: this account's bucket carries
 * the EU jurisdiction, so the plain hostname answers "AccessDenied (403)" —
 * note, NOT "no such bucket", which is what makes it such a misleading
 * failure. The EU hostname is therefore tried first.
 */
const EU_FIRST = true;

/** Remembered after the first success, so we stop paying for the 403. */
let resolved: string | null = null;

export function rememberEndpoint(endpoint: string) {
  resolved = endpoint;
}

/** The hostnames worth trying, in order. */
export function candidateEndpoints(): string[] {
  const explicit = process.env.R2_ENDPOINT;
  if (explicit) return [explicit.replace(/\/+$/, "")];
  if (resolved) return [resolved];
  const plain = `https://${ACCOUNT}.r2.cloudflarestorage.com`;
  const eu = `https://${ACCOUNT}.eu.r2.cloudflarestorage.com`;
  return EU_FIRST ? [eu, plain] : [plain, eu];
}

export function r2(endpoint: string): S3Client {
  return new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId: KEY, secretAccessKey: SECRET },
  });
}

/**
 * Run something against R2, resolving the endpoint on the way.
 *
 * Every caller goes through here so the endpoint hunt lives in one place and
 * every route inherits the memory of which hostname works.
 */
export async function withR2<T>(fn: (client: S3Client) => Promise<T>): Promise<T> {
  let last: unknown;
  for (const endpoint of candidateEndpoints()) {
    try {
      const out = await fn(r2(endpoint));
      rememberEndpoint(endpoint);
      return out;
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

/* --------------------------------------------------------------------------
   What may be stored, and where.

   The allowlist is server-side because the browser is not a gatekeeper — a
   file input's `accept` attribute is a hint to the file picker, not a rule,
   and anyone can post whatever they like to an open route. This is the only
   place that decides.

   Prefixes matter more than they look: photos and compliance documents carry
   very different risk, and separating them at the key level is what lets them
   later get different retention rules and different access checks without
   moving a single object.
-------------------------------------------------------------------------- */

export const SCOPES = {
  photo: {
    prefix: "photos",
    types: ["image/jpeg", "image/png", "image/webp", "image/avif", "image/heic"],
    maxBytes: 15 * 1024 * 1024,
  },
  document: {
    prefix: "documents",
    types: [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
    ],
    maxBytes: 25 * 1024 * 1024,
  },
} as const;

export type Scope = keyof typeof SCOPES;

export const isScope = (s: string): s is Scope => s in SCOPES;

/** Anything that could climb out of its prefix, or upset a URL, is stripped. */
export function safeName(name: string): string {
  const cleaned = name
    .replace(/[/\\]/g, "-")
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || "file").slice(-120);
}

/** A key is only ours if it sits under a prefix we issued. */
export function keyIsOurs(key: string): boolean {
  if (!key || key.includes("..") || key.startsWith("/")) return false;
  return Object.values(SCOPES).some((s) => key.startsWith(`${s.prefix}/`));
}
