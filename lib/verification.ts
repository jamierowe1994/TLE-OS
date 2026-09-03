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
/**
 * How long a link lives, by what it is for.
 *
 * A JOIN link is handed over as much as it is emailed - our own mail is
 * currently landing in Microsoft quarantine, so an invite can sit unseen for
 * hours and then be released. An hour meant a link that was dead before the
 * person ever saw it. A day covers a quarantine release, an evening, and a
 * "sorry, only just seen this" the next morning.
 *
 * A RESET link stays at an hour and should not be lengthened to match. It is
 * a password-recovery credential sent to an address that may itself be the
 * thing that is compromised, and the short window IS the protection. The two
 * links look alike and are not alike.
 */
const TTL_BY_PURPOSE: Record<Purpose, number> = {
  join: 24 * 60 * 60 * 1000,
  reset: 60 * 60 * 1000,
  /* A landlord opens email when they open email. An hour would expire on
     most of them before they saw it; single use is what keeps it safe. */
  landlord: 24 * 60 * 60 * 1000,
  /* The link in the video nudge. Minted two days before a visit, and the
     agent may not open the email until the evening before, so it lives a
     week; still single use, and it only ever opens the recorder. */
  record: 7 * 24 * 60 * 60 * 1000,
};

/** Long enough that guessing is hopeless: 32 bytes, url-safe. */
function mintToken(): string {
  return randomBytes(32).toString("base64url");
}

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

/**
 * "landlord" is a customer's magic link into their property file. It is the
 * one purpose that may be minted for an OUTSIDE address - the whole point is
 * that landlords are not staff - so it skips the internal-domain guard and is
 * sent on the public sender instead. Kept apart from join and reset for the
 * same reason those are kept apart from each other: a token for one must
 * never be spendable on another.
 */
export type Purpose = "join" | "reset" | "landlord" | "record";

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
export async function startVerification(
  rawEmail: string,
  purpose: Purpose = "join",
  opts: {
    /**
     * Leave earlier tokens for the same address alive. Right for the record
     * link, where one agent may hold links for three appraisals at once and
     * the newest must not kill the others; wrong for join and reset, where
     * "the most recent link is the one that works" is the whole point.
     */
    keepOthers?: boolean;
  } = {}
): Promise<{ token: string; email: string }> {
  const email = normaliseEmail(rawEmail);
  if (!email.includes("@")) throw new VerificationError("That isn't an email address.");
  /* Checked HERE as well as at the send path. A verification endpoint that
     will mint tokens for any address is a way to use our sending domain to
     mail strangers, and the refusal should happen before anything is written
     to the database, not after. */
  if (purpose !== "landlord") assertInternalRecipient(email);

  if (!hasDb()) {
    throw new VerificationError(
      "The database isn't connected on this environment, so nobody can be verified yet."
    );
  }

  const token = mintToken();
  const expires = new Date(Date.now() + TTL_BY_PURPOSE[purpose]).toISOString();

  if (!opts.keepOthers) {
    await q(`delete from os_email_verifications where email = $1 and purpose = $2`, [email, purpose]);
  }
  await q(
    `insert into os_email_verifications (email, token_hash, purpose, expires_at, created_at)
     values ($1, $2, $3, $4, now())`,
    [email, hashToken(token), purpose, expires]
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
export async function consumeVerification(
  token: string,
  purpose: Purpose = "join"
): Promise<Verification> {
  if (!token?.trim()) throw new VerificationError("That link is missing its code.");
  if (!hasDb()) throw new VerificationError("The database isn't connected on this environment.");

  const hash = hashToken(token.trim());
  const rows = await q<{ email: string; token_hash: string; expires_at: Date | string; purpose: string }>(
    `select email, token_hash, purpose, expires_at from os_email_verifications where token_hash = $1`,
    [hash]
  );
  const row = rows[0];

  /* One message for "no such token" and for "expired" would be friendlier and
     is exactly what we want to avoid: it tells someone probing whether a code
     ever existed. Expiry is safe to name because they already hold a real
     token to have got here. */
  if (!row) throw new VerificationError("That link isn't valid. Ask for a new one.");

  /* A join link must not set the password on a live account, and a reset link
     must not create one. Same message either way — the holder of a real token
     gains nothing from knowing which kind they have. */
  if (row.purpose !== purpose) {
    throw new VerificationError("That link isn't valid. Ask for a new one.");
  }

  const a = Buffer.from(row.token_hash);
  const b = Buffer.from(hash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new VerificationError("That link isn't valid. Ask for a new one.");
  }

  const expiresAt = new Date(row.expires_at);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
    await q(`delete from os_email_verifications where token_hash = $1`, [hash]);
    throw new VerificationError("That link has expired. Ask for a new one.");
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
