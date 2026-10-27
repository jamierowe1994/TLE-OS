import "server-only";
import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { hasDb, q } from "@/lib/db";
import { record } from "@/lib/audit";
import { sendEmail } from "@/lib/resend";
import { switchOn } from "@/lib/switches";
import { emailCheckEmailFor } from "@/lib/verify-email";

/**
 * IS IT STILL THEM? (James, 26 Oct 2026)
 *
 * "Two-factor authentication, even if that is confirmation via email every
 * couple of days, just to make sure that people are doing it."
 *
 * A password can be shared or guessed; the work mailbox is the second thing
 * only the right person holds. So every EVERY_DAYS days, behind the
 * email_check switch, the person is asked for a six-digit code emailed to
 * their own address before they carry on. Nothing to install, nothing to set
 * up, and a day's work is never stopped twice.
 *
 *   due          lock-state tells the middleware (which can't reach the
 *                database) whether this person is due. The middleware sends
 *                a page to /check-email and answers a call with a marker the
 *                shell's fetch watcher turns into the same trip.
 *   the code     six digits, stored hashed, 15 minutes, five tries, a new one
 *                at most once a minute.
 *   passed       email_checked_at moves on, and a signed os_email_ok cookie
 *                tells the middleware straight away (its own answer is held
 *                for twenty seconds).
 *   fail open    if the email can't be sent, the person is let in this time
 *                and it is logged. A broken mailer must not lock the office out.
 *
 * Test accounts (u-test-*) are never asked.
 */

export const EVERY_DAYS = 3;
const CODE_MINUTES = 15;
const MAX_TRIES = 5;
export const EMAIL_OK_COOKIE = "os_email_ok";

const hash = (code: string) => createHash("sha256").update(code).digest("hex");

/** Is this person due a check? False whenever the switch is off. */
export async function emailCheckDue(userId: string): Promise<boolean> {
  if (!hasDb() || !userId || userId.startsWith("u-test")) return false;
  if (!(await switchOn("email_check").catch(() => false))) return false;
  const [r] = await q<{ email_checked_at: Date | null }>(`SELECT email_checked_at FROM os_users WHERE id = $1`, [userId]);
  if (!r) return false;
  return !r.email_checked_at || Date.now() - new Date(r.email_checked_at).getTime() > EVERY_DAYS * 864e5;
}

/** Where the code went, shown as "ja***@thelettingexperts.co.uk". */
export function maskedEmail(email: string): string {
  const [name, domain] = email.split("@");
  return `${name.slice(0, 2)}${"*".repeat(Math.max(1, Math.min(6, name.length - 2)))}@${domain ?? ""}`;
}

export type SendAnswer = { ok: true; sentTo: string; again: boolean } | { ok: true; letThrough: true; why: string };

/**
 * A code to their own address. A code sent under a minute ago is not sent
 * again (`again: false`), so a reload doesn't fill their inbox. If the email
 * fails, they are marked checked for now and let through (fail open).
 */
export async function sendEmailCheck(user: { id: string; email: string; name?: string | null }, force = false): Promise<SendAnswer> {
  const [held] = await q<{ sent_at: Date; expires_at: Date }>(`SELECT sent_at, expires_at FROM os_email_check_codes WHERE user_id = $1`, [user.id]);
  if (!force && held && Date.now() - new Date(held.sent_at).getTime() < 60_000 && new Date(held.expires_at).getTime() > Date.now()) {
    return { ok: true, sentTo: maskedEmail(user.email), again: false };
  }
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await q(
    `INSERT INTO os_email_check_codes (user_id, code_hash, sent_at, expires_at, attempts)
     VALUES ($1, $2, NOW(), NOW() + ($3::int * INTERVAL '1 minute'), 0)
     ON CONFLICT (user_id) DO UPDATE SET code_hash = EXCLUDED.code_hash, sent_at = NOW(), expires_at = EXCLUDED.expires_at, attempts = 0`,
    [user.id, hash(code), CODE_MINUTES]
  );
  try {
    const mail = emailCheckEmailFor(code, user.name ?? null);
    await sendEmail({ to: user.email, subject: mail.subject, html: mail.html, text: mail.text });
    await record({ kind: "email_check_sent", actorId: user.id, actorEmail: user.email, subjectId: user.id, subjectEmail: user.email, detail: "Code sent", ip: "" });
    return { ok: true, sentTo: maskedEmail(user.email), again: true };
  } catch (e) {
    const why = e instanceof Error ? e.message : "the email did not send";
    await q(`UPDATE os_users SET email_checked_at = NOW() WHERE id = $1`, [user.id]);
    await q(`DELETE FROM os_email_check_codes WHERE user_id = $1`, [user.id]);
    await record({ kind: "email_check_sent", actorId: user.id, actorEmail: user.email, subjectId: user.id, subjectEmail: user.email, detail: `Code could not be sent (${why.slice(0, 120)}), let through this time`, ip: "" });
    return { ok: true, letThrough: true, why };
  }
}

export type ConfirmAnswer = { ok: true } | { ok: false; error: string };

/** The code typed. Five tries, then a new code is needed. */
export async function confirmEmailCheck(user: { id: string; email: string }, typed: string): Promise<ConfirmAnswer> {
  const code = String(typed ?? "").replace(/\D+/g, "");
  if (code.length !== 6) return { ok: false, error: "The code is six digits." };
  const [held] = await q<{ code_hash: string; expires_at: Date; attempts: number }>(`SELECT code_hash, expires_at, attempts FROM os_email_check_codes WHERE user_id = $1`, [user.id]);
  if (!held) return { ok: false, error: "There's no code waiting. Press Send a new code." };
  if (new Date(held.expires_at).getTime() < Date.now()) return { ok: false, error: "That code has run out. Press Send a new code." };
  if (held.attempts >= MAX_TRIES) return { ok: false, error: "Too many tries. Press Send a new code." };
  const a = Buffer.from(hash(code));
  const b = Buffer.from(held.code_hash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    await q(`UPDATE os_email_check_codes SET attempts = attempts + 1 WHERE user_id = $1`, [user.id]);
    return { ok: false, error: held.attempts + 1 >= MAX_TRIES ? "That's not it, and that was the last try. Press Send a new code." : "That's not the code. Check the latest email." };
  }
  await q(`UPDATE os_users SET email_checked_at = NOW() WHERE id = $1`, [user.id]);
  await q(`DELETE FROM os_email_check_codes WHERE user_id = $1`, [user.id]);
  await record({ kind: "email_check_passed", actorId: user.id, actorEmail: user.email, subjectId: user.id, subjectEmail: user.email, detail: "Code confirmed", ip: "" });
  return { ok: true };
}

/**
 * The cookie that tells the middleware this person has just passed, before
 * its own cached answer catches up: `userId.at.sig`, HMAC with AUTH_SECRET
 * over "email-ok.<userId>.<at>". The middleware checks it with Web Crypto.
 */
export function emailOkCookie(userId: string): string {
  const at = String(Date.now());
  const secret = process.env.AUTH_SECRET || "dev-only-secret-not-for-production";
  const sig = createHmac("sha256", secret).update(`email-ok.${userId}.${at}`).digest("base64url");
  return `${userId}.${at}.${sig}`;
}
