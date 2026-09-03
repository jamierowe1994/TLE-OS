import { randomBytes } from "node:crypto";
import { hasDb, q } from "@/lib/db";
import { presentationsFor } from "@/lib/present-store";
import { recipientFor } from "@/lib/agent-recipient";
import { videoChaseEmail } from "@/lib/email/video-chase-email";
import { sendEmail } from "@/lib/resend";
import type { MarketAppraisal } from "@/lib/market-appraisal";

/**
 * The video nudge: "you haven't recorded a video for this one yet."
 *
 * Goes to the AGENT two days before the visit, and only if the pre-appraisal
 * deck has no recording on it. The landlord's pre-appraisal email goes the
 * day before and carries that deck, so the nudge has to land before it, not
 * with it - a day earlier is the smallest gap that still leaves an evening
 * to record one. See lib/email/video-chase-email.ts for the words.
 *
 * ── Queued, then checked again at send time ───────────────────────────────
 *
 * It sits in os_scheduled_sends like the pre-appraisal does, but the runner
 * looks at the deck again before sending: an agent who records on Monday must
 * not be nagged on Tuesday for something they have already done. That check
 * is the whole point of the email, so it happens at the last moment rather
 * than only when queuing.
 *
 * ── Two ways in ───────────────────────────────────────────────────────────
 *
 * Automatically, when the appraisal is booked with a date or when the
 * pre-appraisal email is queued (whichever comes first, once - the queue is
 * checked for a row already waiting). And by hand from the appraisal screen,
 * which is how James tests it: "send it to me now".
 */

export const VIDEO_CHASE_KIND = "video-chase";
export const VIDEO_CHASE_LEAD_DAYS = 2;

type Me = { id: string; email: string; name: string };

/** Is there a finished recording on this appraisal's pre-appraisal deck? */
export async function videoRecorded(ma: MarketAppraisal): Promise<boolean> {
  /* Decks are keyed on the lead where there is one and on the appraisal
     where there is not - both are read, because guessing wrong here sends a
     nudge for a video that exists. */
  const refs = [...new Set([ma.leadId, ma.id].filter((r): r is string => Boolean(r)))];
  const decks = (await Promise.all(refs.map((r) => presentationsFor(r).catch(() => [])))).flat();
  return decks.some(
    (d) => d.kind === "pre-appraisal" && d.deck.welcomeVideo?.status === "ready"
  );
}

/**
 * Two days before the visit, at 9am. Null when there is no date, or when
 * that moment has already passed - a nudge that arrives after the deck has
 * gone out is asking for something that is already too late.
 */
export function chaseSendAt(ma: MarketAppraisal, now = new Date()): Date | null {
  if (!ma.appointmentAt) return null;
  const visit = new Date(ma.appointmentAt);
  if (Number.isNaN(visit.valueOf())) return null;
  const when = new Date(visit);
  when.setDate(when.getDate() - VIDEO_CHASE_LEAD_DAYS);
  when.setHours(9, 0, 0, 0);
  return when > now ? when : null;
}

/** "on Thursday 10 September" - how the visit reads in the email. */
function whenWords(ma: MarketAppraisal): string | undefined {
  if (!ma.appointmentAt) return undefined;
  const d = new Date(ma.appointmentAt);
  if (Number.isNaN(d.valueOf())) return undefined;
  return `on ${d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}`;
}

export interface BuiltChase {
  to: { email: string; name: string; matched: boolean };
  subject: string;
  text: string;
  html: string;
  link: string;
}

/** The finished email, addressed to the agent on the appraisal. */
export async function buildVideoChase(opts: {
  ma: MarketAppraisal;
  me: Me;
  origin: string;
}): Promise<BuiltChase> {
  const to = await recipientFor(opts.ma.agent, { email: opts.me.email, name: opts.me.name || opts.me.email });
  const link = `${opts.origin.replace(/\/+$/, "")}/market-appraisals/${opts.ma.id}`;
  const m = videoChaseEmail({
    link,
    address: opts.ma.address,
    firstName: to.name.split(/\s+/)[0],
    whenPretty: whenWords(opts.ma),
  });
  return { to, subject: m.subject, text: m.text, html: m.html, link };
}

export interface QueuedChase {
  id: string;
  sendAt: string;
  state: string;
  toEmail: string;
  sentAt: string | null;
  error: string | null;
}

/** The nudge already on the queue for this appraisal, latest first. */
export async function queuedVideoChase(ref: string): Promise<QueuedChase | null> {
  if (!hasDb() || !ref) return null;
  const rows = await q<{
    id: string;
    send_at: string;
    state: string;
    to_email: string;
    sent_at: string | null;
    error: string | null;
  }>(
    `SELECT id, send_at, state, to_email, sent_at, error
       FROM os_scheduled_sends
      WHERE ref = $1 AND kind = $2
      ORDER BY created_at DESC LIMIT 1`,
    [ref, VIDEO_CHASE_KIND]
  ).catch(() => []);
  const r = rows[0];
  return r
    ? { id: r.id, sendAt: r.send_at, state: r.state, toEmail: r.to_email, sentAt: r.sent_at, error: r.error }
    : null;
}

/**
 * Put it on the queue for two days before the visit. Says why when it does
 * not, because "nothing happened" is the one answer this must never give.
 */
export async function queueVideoChase(opts: {
  ma: MarketAppraisal;
  me: Me;
  origin: string;
}): Promise<{ queued: boolean; id?: string; sendAt?: string; reason?: string }> {
  if (!hasDb()) return { queued: false, reason: "No database on this environment." };

  const sendAt = chaseSendAt(opts.ma);
  const tooLate = opts.ma.appointmentAt
    ? `The visit is inside ${VIDEO_CHASE_LEAD_DAYS} days, so the moment for a nudge has passed.`
    : "The appraisal has no date yet.";

  /* A visit that moves takes its nudge with it. The queued row is re-dated
     rather than duplicated, and a visit pulled inside two days cancels it -
     a nudge two hours before the landlord's deck goes out is a nag, not a
     reminder. */
  const existing = await queuedVideoChase(opts.ma.id);
  if (existing && existing.state === "queued") {
    if (!sendAt) {
      await q(`UPDATE os_scheduled_sends SET state = 'cancelled', error = $2 WHERE id = $1`, [
        existing.id,
        "The visit moved to within two days, so the nudge was withdrawn.",
      ]).catch(() => []);
      return { queued: false, reason: tooLate };
    }
    if (new Date(existing.sendAt).getTime() !== sendAt.getTime()) {
      const built = await buildVideoChase(opts);
      await q(
        `UPDATE os_scheduled_sends
            SET send_at = $2, subject = $3, body = $4, html = $5, to_email = $6
          WHERE id = $1`,
        [existing.id, sendAt.toISOString(), built.subject, built.text, built.html, built.to.email]
      ).catch(() => []);
    }
    return { queued: true, id: existing.id, sendAt: sendAt.toISOString() };
  }
  if (await videoRecorded(opts.ma)) {
    return { queued: false, reason: "A video is already on the landlord's page." };
  }
  if (!sendAt) return { queued: false, reason: tooLate };

  const built = await buildVideoChase(opts);
  const id = randomBytes(9).toString("base64url");
  await q(
    `INSERT INTO os_scheduled_sends
       (id, kind, ref, to_email, contact_id, subject, body, html, send_at, queued_by, queued_by_id)
     VALUES ($1,$2,$3,$4,NULL,$5,$6,$7,$8,$9,$10)`,
    [
      id,
      VIDEO_CHASE_KIND,
      opts.ma.id,
      built.to.email,
      built.subject,
      built.text,
      built.html,
      sendAt.toISOString(),
      opts.me.name || opts.me.email,
      opts.me.id,
    ]
  );
  return { queued: true, id, sendAt: sendAt.toISOString() };
}

/**
 * Send it this minute. `toMe` puts it in the signed-in person's own inbox
 * whoever the agent is - that is the test button, and a test that lands in a
 * colleague's inbox is a colleague wondering what they did wrong.
 */
export async function sendVideoChaseNow(opts: {
  ma: MarketAppraisal;
  me: Me;
  origin: string;
  toMe?: boolean;
}): Promise<{ to: string; subject: string }> {
  const built = await buildVideoChase(opts);
  const to = opts.toMe ? opts.me.email : built.to.email;
  await sendEmail({ to, subject: built.subject, html: built.html, text: built.text });
  return { to, subject: built.subject };
}
