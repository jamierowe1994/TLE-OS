import "server-only";
import { randomBytes } from "node:crypto";
import { hasDb, q } from "@/lib/db";
import { findUserById, type OsUser } from "@/lib/users";
import { createPresentation, presentationsFor } from "@/lib/present-store";
import { presentAgentFor } from "@/lib/rex-agents";
import { agentProfile } from "@/lib/agent-profile";
import { STANDARD_FEES, firstNameOf, type PresentDeck } from "@/lib/present";
import { bodyFor, subjectFor, type AppraisalInvite } from "@/lib/appraisal-email";
import { renderPlain } from "@/lib/campaign-mail";
import { sendAsAgent, type AgentSendResult } from "@/lib/send-as-agent";
import { sendEmail } from "@/lib/resend";
import { mintRecordLink } from "@/lib/record-link";
import { skyListShell } from "@/lib/email/shell-sky";
import type { MarketAppraisal } from "@/lib/market-appraisal";
import { PRE_SEND_HOLD_MS, PRE_SEND_SOON_MS, londonClock, preSendWhen, type PreOnBooking } from "@/lib/pre-send-time";

/**
 * Sending the pre-presentation: at booking, and on the agent's Send.
 *
 * The rule and the words are in lib/pre-send-time. This is the doing:
 *
 *   scheduleOnBooking   called by the booking itself. Makes the deck (as the
 *                       agent doing the visit, so it is their face on it),
 *                       puts the email on the queue for two hours' time - or
 *                       sends it now, booked for somebody else with the visit
 *                       under three hours away - and tells that agent.
 *   sendPreNow          the agent's Send, with or without a video. Takes the
 *                       queued email (or writes it) and sends it this minute.
 *
 * It uses the same queue and the same runner as before (os_scheduled_sends,
 * os-cron-scheduled-sends every five minutes): a queued pre-presentation
 * still goes out as whoever it is queued as, through lib/send-as-agent, and
 * still waits while customer email is switched off.
 */

export const PRE_KIND = "pre-appraisal";
/** The note to the agent that somebody booked one for them. A record of a
 *  sent email (never queued), and what the bell reads (lib/notifications). */
export const PRE_HEADS_UP_KIND = "pre-heads-up";

const OFFICE_PHONE = "0161 883 2525";

/** Decks and the queue are keyed on the lead where there is one. */
const refOf = (ma: MarketAppraisal) => ma.leadId ?? ma.id;

/** The OS account of the agent named on the appraisal, by name or email. */
export async function agentUserFor(ma: MarketAppraisal): Promise<OsUser | null> {
  const key = (ma.agent ?? "").trim().toLowerCase();
  if (!key || !hasDb()) return null;
  const rows = await q<{ id: string }>(
    `SELECT id FROM os_users WHERE lower(trim(name)) = $1 OR lower(email) = $1 LIMIT 1`,
    [key]
  ).catch(() => []);
  return rows[0] ? findUserById(rows[0].id).catch(() => null) : null;
}

/** Is the person booking the agent who will do the visit? No agent named
 *  means whoever is booking is doing it. */
export function bookedBySelf(me: OsUser, agent: OsUser | null, ma: MarketAppraisal): boolean {
  if (agent) return agent.id === me.id;
  const named = (ma.agent ?? "").trim().toLowerCase();
  return !named || named === me.name.trim().toLowerCase() || named === me.email.toLowerCase();
}

const whenPrettyOf = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", {
        timeZone: "Europe/London",
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "numeric",
        minute: "2-digit",
      })
    : "";

/**
 * The pre-presentation for this appraisal: the one already made, or a new one
 * made as `author`. The same deck the file page makes on first open
 * (mintPreAppraisalDeck), minted here so it exists before the email does.
 */
export async function ensurePreDeck(ma: MarketAppraisal, author: OsUser, origin: string): Promise<{ token: string; url: string } | null> {
  const base = origin.replace(/\/+$/, "");
  for (const ref of [...new Set([ma.leadId, ma.id].filter((r): r is string => Boolean(r)))]) {
    const held = (await presentationsFor(ref).catch(() => [])).find((d) => d.kind === "pre-appraisal");
    if (held) return { token: held.token, url: `${base}/present/${held.token}` };
  }
  const profile = await agentProfile(author.id);
  const agent = await presentAgentFor(author.email, { name: author.name, email: author.email }, profile.bio, profile.photo).catch(() => ({
    name: author.name,
    firstName: firstNameOf(author.name),
    title: "",
    email: author.email,
    phone: "",
    photo: profile.photo,
    bio: profile.bio,
  }));
  const deck: PresentDeck = {
    kind: "pre-appraisal",
    recipientName: ma.landlord.trim(),
    property: { address: ma.address, postcode: ma.postcode ?? "", image: null, beds: null, baths: null, sqft: null, propertyType: null, epc: null },
    whenPretty: whenPrettyOf(ma.appointmentAt),
    startsAt: ma.appointmentAt,
    minutes: 45,
    agent,
    comparables: null,
    market: null,
    listings: null,
    material: null,
    fees: STANDARD_FEES,
    valuation: null,
    terms: null,
    hidden: null,
    builder: null,
    createdAt: new Date().toISOString(),
  };
  const row = await createPresentation({ ref: refOf(ma), deck, authorId: author.id, authorName: author.name });
  return row ? { token: row.token, url: `${base}/present/${row.token}` } : null;
}

function inviteFor(ma: MarketAppraisal, sender: OsUser, deckUrl: string): AppraisalInvite {
  return {
    landlordName: ma.landlord,
    address: ma.address,
    whenPretty: whenPrettyOf(ma.appointmentAt),
    startsAt: ma.appointmentAt,
    minutes: 45,
    agentName: ma.agent || sender.name || "The Letting Experts",
    agentPhone: OFFICE_PHONE,
    presentationUrl: deckUrl,
  };
}

type PreRow = { id: string; state: string; send_at: string; sent_at: string | null };

/** The latest pre-presentation email for this appraisal, whatever its state. */
export async function preRowFor(ma: MarketAppraisal): Promise<PreRow | null> {
  if (!hasDb()) return null;
  const refs = [...new Set([ma.leadId, ma.id].filter((r): r is string => Boolean(r)))];
  const rows = await q<PreRow>(
    `SELECT id, state, send_at, sent_at FROM os_scheduled_sends
      WHERE kind = $1 AND ref = ANY($2) AND state IN ('queued','sending','sent')
      ORDER BY (state = 'sent') DESC, created_at DESC LIMIT 1`,
    [PRE_KIND, refs]
  ).catch(() => []);
  return rows[0] ?? null;
}

/**
 * Put the finished email on the queue for `sendAt`, as `sender`. One queued
 * row per appraisal and address: queuing again re-dates and re-words it (a
 * moved visit), the same rule as /api/scheduled-sends.
 */
async function queuePre(ma: MarketAppraisal, sender: OsUser, sendAt: Date, deckUrl: string): Promise<string> {
  const invite = inviteFor(ma, sender, deckUrl);
  const subject = subjectFor(invite);
  const text = bodyFor(invite);
  const to = (ma.landlordEmail ?? "").trim();
  const again = await q<{ id: string }>(
    `UPDATE os_scheduled_sends
        SET subject = $4, body = $5, send_at = $6, queued_by = $7, queued_by_id = $8, error = NULL
      WHERE id = (
        SELECT id FROM os_scheduled_sends
         WHERE state = 'queued' AND kind = $1 AND ref = $2 AND LOWER(to_email) = LOWER($3)
         ORDER BY send_at DESC LIMIT 1
      )
      RETURNING id`,
    [PRE_KIND, refOf(ma), to, subject, text, sendAt.toISOString(), sender.name, sender.id]
  );
  if (again[0]) return again[0].id;
  const id = randomBytes(9).toString("base64url");
  await q(
    `INSERT INTO os_scheduled_sends
       (id, kind, ref, to_email, contact_id, subject, body, send_at, queued_by, queued_by_id)
     VALUES ($1,$2,$3,$4,NULL,$5,$6,$7,$8,$9)`,
    [id, PRE_KIND, refOf(ma), to, subject, text, sendAt.toISOString(), sender.name, sender.id]
  );
  return id;
}

export interface PreSendResult {
  sent: boolean;
  /** Not sent, but still queued: customer email is switched off here, and the
   *  runner tries again every five minutes. */
  held?: boolean;
  at: string | null;
  detail: string;
}

/**
 * Send it now. Pressed by the agent (Send, or Send it without a video), or by
 * a booking for somebody else with the visit too close to wait.
 */
export async function sendPreNow(opts: { ma: MarketAppraisal; me: OsUser; origin: string }): Promise<PreSendResult> {
  const { ma, me, origin } = opts;
  if (!hasDb()) return { sent: false, at: null, detail: "No database on this environment, so nothing can be sent." };
  const already = await preRowFor(ma);
  if (already?.state === "sent") return { sent: true, at: already.sent_at, detail: `It already went to ${ma.landlord}.` };
  if (already?.state === "sending") return { sent: true, at: null, detail: "It is on its way." };
  if (!ma.landlordEmail) return { sent: false, at: null, detail: "There is no email for the landlord on this file, so it cannot go." };

  /* As the agent doing the visit where they have an account: it is their
     name at the foot of it, so it should be their mailbox it comes from. */
  const sender = (await agentUserFor(ma)) ?? me;
  const deck = await ensurePreDeck(ma, sender, origin);
  if (!deck) return { sent: false, at: null, detail: "The pre-presentation could not be made, so nothing was sent." };

  const id = await queuePre(ma, sender, new Date(), deck.url);
  /* Claimed the way the runner claims, so a cron run landing in the same
     second cannot send it as well. */
  const claimed = await q<{ subject: string; body: string; to_email: string }>(
    `UPDATE os_scheduled_sends SET state = 'sending' WHERE id = $1 AND state = 'queued' RETURNING subject, body, to_email`,
    [id]
  );
  if (!claimed[0]) return { sent: true, at: null, detail: "It is on its way." };
  const mail = renderPlain(claimed[0].subject, claimed[0].body);
  const out = await sendAsAgent({ me: sender, to: claimed[0].to_email, subject: mail.subject, html: mail.html }).catch(
    (e): AgentSendResult => ({ sent: false, via: null, timeline: false, reason: "refused", detail: e instanceof Error ? e.message : "It did not send." })
  );
  if (out.sent) {
    const r = await q<{ sent_at: string }>(
      `UPDATE os_scheduled_sends SET state = 'sent', sent_at = NOW(), error = NULL WHERE id = $1 RETURNING sent_at`,
      [id]
    );
    return { sent: true, at: r[0] ? new Date(r[0].sent_at).toISOString() : new Date().toISOString(), detail: `Sent to ${ma.landlord}. ${out.detail}` };
  }
  /* A switch that is off is the environment, not this email: back on the
     queue, and the runner sends it the minute the switch goes on. */
  const held = out.reason === "switched_off";
  await q(`UPDATE os_scheduled_sends SET state = $2, error = $3 WHERE id = $1`, [id, held ? "queued" : "failed", out.detail]).catch(() => []);
  return { sent: false, held, at: null, detail: out.detail };
}

/** The note to the agent somebody else booked it for: an email, and the
 *  row the bell reads. Never the reason a booking fails. */
async function tellAgent(o: { ma: MarketAppraisal; agent: OsUser; me: OsUser; origin: string; sentNow: boolean; soon?: boolean; at: string | null }): Promise<boolean> {
  const { ma, agent, me } = o;
  const link = await mintRecordLink({ email: agent.email, appraisalId: ma.id, origin: o.origin });
  const booker = me.name.split(/\s+/)[0] || "The office";
  const visit = ma.appointmentAt
    ? `${new Date(ma.appointmentAt).toLocaleDateString("en-GB", { timeZone: "Europe/London", weekday: "long", day: "numeric", month: "long" })} at ${londonClock(ma.appointmentAt)}`
    : "";
  const goes = o.at ? preSendWhen(o.at) : "";
  /* Too close to wait: sent, or held only by a switch and going the moment
     it is on. Either way there is no window to record in first. */
  const now = o.sentNow || o.soon;
  const heading = o.sentNow ? "Your pre-presentation has gone" : o.soon ? "Your pre-presentation is on its way" : "Your pre-presentation goes in 2 hours";
  const subject = now
    ? `Pre-presentation ${o.sentNow ? "sent" : "on its way"} - ${ma.address}`
    : `Record a video - the pre-presentation for ${ma.address} goes ${goes}`;
  const line = now
    ? `${booker} booked your market appraisal at ${ma.address}${visit ? ` for ${visit}` : ""}. The visit is close, so the pre-presentation ${o.sentNow ? "went" : "is going"} to ${ma.landlord} straight away. A video you record now still appears on their page.`
    : `${booker} booked your market appraisal at ${ma.address}${visit ? ` for ${visit}` : ""}. The pre-presentation goes to ${ma.landlord} ${goes}. Record a short video for the front of it before then, or send it sooner from the appraisal.`;
  const html = skyListShell({
    heading,
    intro: line,
    button: "Record a video",
    link,
    hero: "hero-video.png",
    tip: now
      ? "Entirely optional. The appraisal goes ahead exactly the same without one."
      : "Entirely optional. If you do nothing, it goes on its own without a video.",
    tipQuiet: true,
  });
  let state = "sent";
  let error: string | null = null;
  try {
    await sendEmail({ to: agent.email, subject, html, text: `${line}\n\n${link}` });
  } catch (e) {
    state = "failed";
    error = e instanceof Error ? e.message : "It did not send.";
  }
  /* Written whether or not the email went: the bell is the other half of
     telling them, and it must not depend on the mail. */
  const wrote = await q(
    `INSERT INTO os_scheduled_sends
       (id, kind, ref, to_email, contact_id, subject, body, html, send_at, state, sent_at, error, queued_by, queued_by_id)
     VALUES ($1,$2,$3,$4,NULL,$5,$6,$7,NOW(),$8,${state === "sent" ? "NOW()" : "NULL"},$9,$10,$11)`,
    [randomBytes(9).toString("base64url"), PRE_HEADS_UP_KIND, ma.id, agent.email, subject, line, html, state, error, me.name || me.email, me.id]
  ).then(() => true, () => false);
  /* Told is the bell or the email: either one reaches them. */
  return wrote || state === "sent";
}

/**
 * The booking's half. Best effort, after the booking is safe, like everything
 * else the booking route does: a pre-presentation that cannot be scheduled is
 * said on the done screen and the file, never thrown at the appointment.
 */
export async function scheduleOnBooking(opts: { ma: MarketAppraisal; me: OsUser; origin: string; now?: Date }): Promise<PreOnBooking> {
  const { ma, me, origin } = opts;
  const now = opts.now ?? new Date();
  const agent = await agentUserFor(ma);
  const self = bookedBySelf(me, agent, ma);
  const out: PreOnBooking = {
    appraisalId: ma.id,
    self,
    agentName: agent?.name || ma.agent || me.name,
    landlord: ma.landlord,
    address: ma.address,
    deck: null,
    state: "none",
    at: null,
    told: false,
  };
  if (!hasDb()) return { ...out, detail: "No database on this environment." };
  const visit = ma.appointmentAt ? new Date(ma.appointmentAt) : null;
  if (!visit || Number.isNaN(visit.valueOf()) || visit <= now) return { ...out, detail: "The visit has no date ahead of it." };

  const sender = agent ?? me;
  out.deck = await ensurePreDeck(ma, sender, origin).catch(() => null);
  if (!out.deck) return { ...out, detail: "The pre-presentation could not be made. It is made again when the file is opened." };

  /* A visit moved after it went: it has gone, and is not sent twice. */
  const held = await preRowFor(ma);
  if (held?.state === "sent") return { ...out, state: "sent", at: held.sent_at ? new Date(held.sent_at).toISOString() : null };
  if (!ma.landlordEmail) return { ...out, detail: "There is no email for the landlord on this file, so it cannot go until one is added." };

  const soon = visit.getTime() - now.getTime() < PRE_SEND_SOON_MS;
  if (soon && !self) {
    const r = await sendPreNow({ ma, me, origin });
    const state = r.sent ? "sent" : r.held ? "queued" : "none";
    const told = agent ? await tellAgent({ ma, agent, me, origin, sentNow: r.sent, soon: true, at: r.at ?? now.toISOString() }).catch(() => false) : false;
    return { ...out, state, at: r.at ?? (r.held ? now.toISOString() : null), told, detail: r.sent ? undefined : r.detail };
  }

  /* The two hours: the agent's to record in, or to send it sooner. For the
     agent who booked it themselves this is only the backstop - they are
     offered the video and the Send on the done screen. A visit too close
     for two hours waits a quarter of an hour at most. */
  const sendAt = new Date(now.getTime() + (soon ? 15 * 60 * 1000 : PRE_SEND_HOLD_MS));
  await queuePre(ma, sender, sendAt, out.deck.url);
  const told = !self && agent ? await tellAgent({ ma, agent, me, origin, sentNow: false, at: sendAt.toISOString() }).catch(() => false) : false;
  return { ...out, state: "queued", at: sendAt.toISOString(), told };
}
