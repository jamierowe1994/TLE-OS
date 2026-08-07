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
