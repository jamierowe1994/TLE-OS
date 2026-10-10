import "server-only";
import { createHash, randomBytes } from "node:crypto";
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
  /* A tenant, the same as a landlord: opened when they open email. */
  tenant: 24 * 60 * 60 * 1000,
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
export type Purpose = "join" | "reset" | "landlord" | "record" | "tenant";

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
  if (purpose !== "landlord" && purpose !== "tenant") assertInternalRecipient(email);

  if (!hasDb()) {
    throw new VerificationError(
      "The database isn't connected on this environment, so nobody can be verified yet."
    );
  }

  /* PER-ADDRESS THROTTLE (18 Sep sweep, item 12). Nothing stopped a script
     asking for a landlord link for the same address every second, each one
     an email under our name. Five in ten minutes is more than any person
     needs; the sixth is refused, and the caller's neutral answer does not
     say so. Counted on created_at, so earlier links are EXPIRED rather than
     deleted when a newer one is minted - single use and "the newest is the
     one that works" both still hold, because consume refuses an expired row. */
  const recent = await q<{ n: string }>(
    `select count(*)::text as n from os_email_verifications
      where email = $1 and purpose = $2 and created_at > now() - interval '10 minutes'`,
    [email, purpose]
  ).catch(() => []);
  if (Number(recent[0]?.n ?? 0) >= 5) {
    throw new VerificationError("Five links have gone to that address in the last ten minutes. Use the newest, or wait a little and ask again.");
  }

  const token = mintToken();
  const expires = new Date(Date.now() + TTL_BY_PURPOSE[purpose]).toISOString();

  if (!opts.keepOthers) {
    await q(`update os_email_verifications set expires_at = now() where email = $1 and purpose = $2 and expires_at > now()`, [email, purpose]);
  }
  /* Yesterday's dead rows go, so the table does not grow with every ask. */
  await q(`delete from os_email_verifications where expires_at < now() - interval '1 day'`).catch(() => null);
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
  /* ONE statement that takes the token (Rig run 4, P-036, 10 Oct 2026). It was
     a SELECT, checks, then a separate DELETE, so twenty presses of one link at
     the same moment all read it before any deleted it: twenty sessions from a
     single-use link. Now whoever deletes the row is the only one who gets it.
     The purpose is in the WHERE, so a join link offered to the reset page is
     refused and left alone, as before. */
  const rows = await q<{ email: string; expires_at: Date | string }>(
    `delete from os_email_verifications where token_hash = $1 and purpose = $2 returning email, expires_at`,
    [hash, purpose]
  );
  const row = rows[0];

  /* One message for "no such token" and for "expired" would be friendlier and
     is exactly what we want to avoid: it tells someone probing whether a code
     ever existed. Expiry is safe to name because they already hold a real
     token to have got here. A join link must not set the password on a live
     account, and a reset link must not create one - same message either way. */
  if (!row) throw new VerificationError("That link isn't valid. Ask for a new one.");

  const expiresAt = new Date(row.expires_at);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
    throw new VerificationError("That link has expired. Ask for a new one.");
  }

  return { email: row.email, expiresAt: expiresAt.toISOString() };
}

/**
 * Two halves of "replace a link only once the new one has been delivered".
 *
 * Found testing Reissue, 30 Sep 2026: minting expires every earlier link
 * straight away, so when the invite email then FAILED to send, the person was
 * left with no working link at all - the one they had was dead and the new
 * one never arrived. A sender that mints with keepOthers, then calls
 * retireOtherLinks after a successful send (or dropLink after a failed one),
 * cannot strand anybody.
 */
export async function retireOtherLinks(rawEmail: string, purpose: Purpose, keepToken: string): Promise<void> {
  await q(
    `update os_email_verifications set expires_at = now()
      where email = $1 and purpose = $2 and token_hash <> $3 and expires_at > now()`,
    [normaliseEmail(rawEmail), purpose, hashToken(keepToken)]
  );
}

export async function dropLink(token: string): Promise<void> {
  await q(`delete from os_email_verifications where token_hash = $1`, [hashToken(token)]);
}

/**
 * The newest join link's expiry for each address, for the Pre-launch list.
 *
 * Josel, 30 Sep 2026: her invite link had died of old age and nothing on the
 * screen said so - she found out by clicking it. This lets the list say
 * "live until" or "expired" before anybody has to.
 *
 * The newest row is the one that counts, because minting a link expires every
 * earlier one for that address. Dead rows linger a day and then go, and a used
 * link is deleted outright, so an invited address with no row at all means
 * the link is gone either way - the caller decides what to call that.
 */
export async function latestJoinLinks(emails: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const wanted = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (!wanted.length || !hasDb()) return out;
  const rows = await q<{ email: string; expires_at: Date | string }>(
    `select lower(email) as email, max(expires_at) as expires_at
       from os_email_verifications
      where purpose = 'join' and lower(email) = any($1)
      group by lower(email)`,
    [wanted]
  ).catch(() => []);
  for (const r of rows) out.set(r.email, new Date(r.expires_at).toISOString());
  return out;
}

/** Housekeeping: drop anything already dead. Safe to call whenever. */
export async function purgeExpired(): Promise<number> {
  if (!hasDb()) return 0;
  const rows = await q<{ id: number }>(
    `delete from os_email_verifications where expires_at < now() returning 1 as id`
  );
  return rows.length;
}
