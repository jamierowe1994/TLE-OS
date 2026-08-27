import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { hasDb, q } from "@/lib/db";
import { normaliseEmail } from "@/lib/users";
import { assertInternalRecipient } from "@/lib/email-policy";

/**
 * Email verification — proving somebody owns the address they typed.
 *
 * ── The four rules this file exists to keep ───────────────────────────────
 *
 * **1. The token is hashed at rest.** We store a SHA-256 of it and never the
 * token itself. Otherwise anyone who can read the table — a backup, a support
 * query, a leaked connection string — can log in as anybody who has a pending
 * verification. The token is shown exactly once, in the email, and is then
 * unrecoverable by us. That is the point.
 *
 * **2. Single use.** Consumed on first success, so a link forwarded, quoted in
 * a reply chain, or sitting in a mail archive is inert.
 *
 * **3. Short-lived.** One hour. Long enough to walk to a laptop, short enough
 * that an old email in an inbox is not a standing key.
 *
 * **4. Verification is not access.** This proves an address is real. Whether
 * its owner belongs in the OS is a completely different question, answered by
 * the allowlist. Conflating them means anyone with a company address lets
 * themselves in.
 *
 * ── Why compare in constant time ──────────────────────────────────────────
 *
 * We look the row up BY HASH, so a plain SQL equality would already be the
 * comparison. The constant-time check is belt and braces for the day somebody
 * refactors this to "fetch by email, then compare" — which is the natural,
 * obvious, and timing-leaky way to write it.
 */

/** One hour. See rule 3. */
const TTL_MS = 60 * 60 * 1000;

/** Long enough that guessing is hopeless: 32 bytes, url-safe. */
function mintToken(): string {
  return randomBytes(32).toString("base64url");
}

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export interface Verification {
  email: string;
  expiresAt: string;
}

export class VerificationError extends Error {}

/**
 * Start a verification and return the token to email.
 *
 * The caller emails it. This function deliberately does NOT send: a store that
 * also sends cannot be tested without either mocking a mailer or emailing
 * somebody, and the send path has its own rules to obey.
 *
 * Any earlier pending verification for the address is cleared first, so a
 * person who clicks "resend" three times has exactly one live link rather than
 * three, and the most recent one is the one that works — which is the one they
 * are looking at.
 */
export async function startVerification(rawEmail: string): Promise<{ token: string; email: string }> {
  const email = normaliseEmail(rawEmail);
  if (!email.includes("@")) throw new VerificationError("That isn't an email address.");
  /* Checked HERE as well as at the send path. A verification endpoint that
     will mint tokens for any address is a way to use our sending domain to
     mail strangers, and the refusal should happen before anything is written
     to the database, not after. */
  assertInternalRecipient(email);

  if (!hasDb()) {
    throw new VerificationError(
      "The database isn't connected on this environment, so nobody can be verified yet."
    );
  }

  const token = mintToken();
  const expires = new Date(Date.now() + TTL_MS).toISOString();

  await q(`delete from os_email_verifications where email = $1`, [email]);
  await q(
    `insert into os_email_verifications (email, token_hash, expires_at, created_at)
     values ($1, $2, $3, now())`,
    [email, hashToken(token), expires]
  );

  return { token, email };
}

/**
 * Consume a token.
 *
 * Returns the verified address, or throws. Consuming and validating are one
 * operation on purpose: a "check" that a caller can perform without consuming
 * is a replayable token waiting for somebody to forget the second call.
 */
export async function consumeVerification(token: string): Promise<Verification> {
  if (!token?.trim()) throw new VerificationError("That link is missing its code.");
  if (!hasDb()) throw new VerificationError("The database isn't connected on this environment.");

  const hash = hashToken(token.trim());
  const rows = await q<{ email: string; token_hash: string; expires_at: Date | string }>(
    `select email, token_hash, expires_at from os_email_verifications where token_hash = $1`,
    [hash]
  );
  const row = rows[0];

  /* One message for "no such token" and for "expired" would be friendlier and
     is exactly what we want to avoid: it tells someone probing whether a code
     ever existed. Expiry is safe to name because they already hold a real
     token to have got here. */
  if (!row) throw new VerificationError("That link isn't valid. Ask for a new one.");

  const a = Buffer.from(row.token_hash);
  const b = Buffer.from(hash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new VerificationError("That link isn't valid. Ask for a new one.");
  }

  const expiresAt = new Date(row.expires_at);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
    await q(`delete from os_email_verifications where token_hash = $1`, [hash]);
    throw new VerificationError("That link has expired — they last an hour. Ask for a new one.");
  }

  // Single use. Deleted before the caller does anything with the result, so a
  // failure downstream cannot leave a live token behind.
  await q(`delete from os_email_verifications where token_hash = $1`, [hash]);

  return { email: row.email, expiresAt: expiresAt.toISOString() };
}

/** Housekeeping: drop anything already dead. Safe to call whenever. */
export async function purgeExpired(): Promise<number> {
  if (!hasDb()) return 0;
  const rows = await q<{ id: number }>(
    `delete from os_email_verifications where expires_at < now() returning 1 as id`
  );
  return rows.length;
}
