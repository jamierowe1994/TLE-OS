/**
 * Resend — sending in our own name.
 *
 * ── What changed, and why this now exists ─────────────────────────────────
 *
 * On 9 Aug the decision was to send through REX's `MailMerge/createAndSend`:
 * no bill, no new sending domain, and — the real reason — every send lands on
 * the contact's REX timeline, where the team actually lives.
 *
 * On 27 Aug James verified the TLE OS domain in Resend. So this is the second
 * sender, not a replacement. See lib/mailer.ts for how the two are chosen
 * between, and read that file before assuming either one is "the" mailer.
 *
 * ── The cost of sending this way, stated plainly ──────────────────────────
 *
 * A Resend send is INVISIBLE IN REX. Nobody opening that landlord tomorrow
 * will see it. That is not a bug to fix later, it is the trade: Resend gives
 * us our own templates, our own domain and delivery we can measure; REX gives
 * us the timeline. Which matters more depends on the email, which is exactly
 * why the choice is per-send and not global.
 *
 * ── The lock, same three states as DocuSeal ───────────────────────────────
 *
 *   RESEND_API_KEY unset                → inert
 *   set, RESEND_ALLOW_SEND unset        → composes and previews, refuses to send
 *   RESEND_ALLOW_SEND="yes"             → sends
 *
 * "Configured" and "permitted to email a real person" are different questions.
 * Collapsing them is how a first careful test becomes an accident.
 */

import { SANDBOX_EMAIL_DOMAIN } from "@/lib/sandbox";
import { hasDb, q } from "@/lib/db";
import { uid } from "@/lib/auth";
import { assertInternalRecipient } from "@/lib/email-policy";

const API = "https://api.resend.com/emails";

export class ResendBlocked extends Error {}

export function resendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && fromAddress());
}

export function resendSendUnlocked(): boolean {
  return (process.env.RESEND_ALLOW_SEND ?? "").trim().toLowerCase() === "yes";
}

/**
 * Who it comes from.
 *
 * Must be on the domain verified in Resend or every send 403s. Kept as a var
 * rather than hardcoded because the verified domain is James's to choose and a
 * string buried in code is a thing nobody can change without me.
 */
export function fromAddress(): string | null {
  const raw = (process.env.RESEND_FROM ?? "").trim();
  return raw || null;
}

export interface SendResult {
  id: string;
}

/**
 * Keep a copy of what actually went out.
 *
 * ── Stored, not re-rendered ───────────────────────────────────────────────
 *
 * Re-rendering a template on demand answers a different question: it shows
 * what that email would look like TODAY and presents it as what somebody
 * received a fortnight ago. These templates changed several times in one
 * afternoon — the copy, the animation and the whole shell were replaced
 * between one invite and the next. A record that quietly updates itself is
 * not a record.
 *
 * ── The link is redacted first ────────────────────────────────────────────
 *
 * An invite carries a live one-time join token. Keeping it would put a working
 * credential in a table any owner can read, so somebody could open the log and
 * claim an account before its owner did. The href is replaced here, at write
 * time, so the button still renders and can no longer be spent.
 *
 * ── It must never break a send ────────────────────────────────────────────
 *
 * The mail has already left by the time this runs. A failure to file the copy
 * is not a failure to deliver, and must not be reported as one.
 */
async function archive(to: string, subject: string, html: string): Promise<void> {
  if (!hasDb()) return;
  try {
    const safe = html.replace(
      /href="[^"]*(?:token=|\/join\?|\/reset\/)[^"]*"/g,
      'href="#link-removed-from-this-copy"'
    );
    await q(
      `INSERT INTO os_sent_emails (id, to_email, subject, html) VALUES ($1,$2,$3,$4)`,
      [uid(), to, subject, safe]
    );
  } catch {
    /* Filing the copy is not the job. Delivering was. */
  }
}

export async function sendEmail(msg: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}): Promise<SendResult> {
  if (!process.env.RESEND_API_KEY) {
    throw new ResendBlocked("Resend isn't connected — RESEND_API_KEY isn't set.");
  }
  if (!fromAddress()) {
    throw new ResendBlocked(
      "RESEND_FROM isn't set. It must be an address on the domain verified in Resend, e.g. hello@thelettingexperts.co.uk."
    );
  }
  if (!resendSendUnlocked()) {
    throw new ResendBlocked(
      'Sending is locked on this environment. Set RESEND_ALLOW_SEND="yes" to unlock it — and send the first one to a colleague, not a landlord.'
    );
  }

  const to = msg.to.trim();
  if (!to.includes("@")) throw new ResendBlocked(`"${to || "(blank)"}" isn't an email address.`);
  /* The sandbox guarantee, enforced at the send path rather than trusted to
     the caller. sandbox.invalid can never resolve, but we refuse before the
     request rather than relying on that. */
  if (to.toLowerCase().endsWith(`@${SANDBOX_EMAIL_DOMAIN}`)) {
    throw new ResendBlocked("That's a sandbox address — sandbox records can't be emailed.");
  }
  /* THE INTERNAL-ONLY RULE. This domain is for colleagues: verification links,
     password confirmations, invites. A landlord or tenant must never receive
     mail from it — client email waits for the public Lettings Experts domain.
     Enforced here, at the one place mail actually leaves, rather than at the
     call sites, which multiply. See lib/email-policy for the full reasoning. */
  assertInternalRecipient(to);
  if (!msg.subject.trim() || !msg.html.trim()) {
    throw new ResendBlocked("The email needs a subject and a body.");
  }

  const res = await fetch(API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddress(),
      to: [to],
      subject: msg.subject,
      html: msg.html,
      ...(msg.text ? { text: msg.text } : {}),
      ...(msg.replyTo ? { reply_to: msg.replyTo } : {}),
    }),
    signal: AbortSignal.timeout(20_000),
  });

  const text = await res.text();
  if (res.ok) await archive(to, msg.subject, msg.html);
  if (!res.ok) {
    /* Resend's own words. "The domain is not verified" is a fixable
       instruction; "send failed" is not. */
    let detail = text.slice(0, 300);
    try {
      const j = JSON.parse(text) as { message?: string; error?: string };
      detail = j.message ?? j.error ?? detail;
    } catch {
      /* not JSON — raw body is still the most useful thing we have */
    }
    throw new ResendBlocked(`Resend said ${res.status}: ${detail}`);
  }

  const j = JSON.parse(text) as { id?: string };
  if (!j.id) throw new ResendBlocked("Resend accepted the request but returned no id.");
  return { id: j.id };
}
