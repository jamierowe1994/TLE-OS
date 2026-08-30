import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The share link for the onboarding preview.
 *
 * James needs to send Susan a URL that shows her what a new starter sees,
 * without giving her an account and without her signing in to anything. So
 * this is a capability URL: holding the link IS the permission.
 *
 * ── Why it is derived and not stored ──────────────────────────────────────
 *
 * An HMAC of AUTH_SECRET rather than a row in a table or a new environment
 * variable. It needs no migration, no deploy step and no configuration, and
 * it is the same string every time it is asked for - which matters, because
 * the whole point is that James can paste it into a message today and it
 * still works during a presentation next week.
 *
 * ── Revoking it ───────────────────────────────────────────────────────────
 *
 * `ONBOARDING_PREVIEW_VERSION` bumps the token without touching AUTH_SECRET.
 * That separation is deliberate: rotating AUTH_SECRET would invalidate every
 * session token in the product and sign the entire company out, which is far
 * too big a hammer for "that link got forwarded to someone it shouldn't have".
 * Set it to 2, redeploy, and the old link 404s.
 *
 * ── What the link can actually reach ──────────────────────────────────────
 *
 * Only /preview. Everything under it is self-contained: mock rail, sample
 * figures, no fetches, no writes, no session. Holding this token gets you a
 * demonstration and nothing else - it is not a way into the OS, and it must
 * never become one. Do not reuse this token to gate anything that reads real
 * data.
 */

function secret(): string {
  return process.env.AUTH_SECRET || "dev-only-secret-not-for-production";
}

/** The current share token. Stable until ONBOARDING_PREVIEW_VERSION changes. */
export function previewToken(): string {
  const version = process.env.ONBOARDING_PREVIEW_VERSION || "1";
  return createHmac("sha256", secret())
    .update(`onboarding-preview:${version}`)
    .digest("base64url")
    .slice(0, 32);
}

/** Constant time, so the token cannot be discovered a character at a time. */
export function previewTokenValid(candidate: string | undefined): boolean {
  if (!candidate) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(previewToken());
  return a.length === b.length && timingSafeEqual(a, b);
}
