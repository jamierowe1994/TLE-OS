import "server-only";
import { hasDb, q } from "@/lib/db";
import { readAnswers } from "@/lib/property-answers-store";
import { calendarLinks, calendarLinesFor } from "@/lib/calendar-links";
import { renderPlain } from "@/lib/campaign-mail";
import { cleanEmailHtml, lastSent, recordSent, isRepeat, sentWords } from "@/lib/confirmations";
import { sendAsAgent } from "@/lib/send-as-agent";
import type { MarketAppraisal } from "@/lib/market-appraisal";
import type { OsUser } from "@/lib/users";

/**
 * THE TAKE-ON VISIT (James, 17 Sep 2026).
 *
 * "We don't seem to have any process for booking a take-on visit, which will
 * be everything from going around taking floor plans, taking photos, and
 * doing all of these individual bits."
 *
 * Two halves that meet in the middle:
 *
 *   The landlord, once their compliance is in, can SUGGEST times from their
 *   own file - optional, because a re-let often reuses the photographs it
 *   already has. Their times come through to the agent.
 *
 *   The agent books it from the appraisal, in the same booker the appraisal
 *   was booked in: the diary, the confirmation beside it, Book and send.
 *
 * Both are kept in os_case_state against the appraisal:
 *   takeon-times    what the landlord offered
 *   takeon-booked   what was agreed, once it is in the diary
 */

const TIMES = "takeon-times";
const BOOKED = "takeon-booked";

export interface TakeOnTimes {
  /** ISO days with a part of the day: the landlord picks, not types. */
  slots: Array<{ day: string; part: "morning" | "afternoon" | "either" }>;
  note: string;
  at: string;
}

export interface TakeOnBooking {
  startsAt: string;
  minutes: number;
  by: string;
  at: string;
}

export async function takeOnTimes(appraisalId: string): Promise<TakeOnTimes | null> {
  if (!hasDb()) return null;
  const rows = await q<{ payload: TakeOnTimes }>(`SELECT payload FROM os_case_state WHERE kind = $1 AND record_id = $2`, [TIMES, appraisalId]).catch(() => []);
  return rows[0]?.payload ?? null;
}

export async function saveTakeOnTimes(appraisalId: string, times: TakeOnTimes, by: string): Promise<void> {
  if (!hasDb()) return;
  await q(
    `INSERT INTO os_case_state (kind, record_id, payload, updated_at, updated_by)
     VALUES ($1, $2, $3::jsonb, NOW(), $4)
     ON CONFLICT (kind, record_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
    [TIMES, appraisalId, JSON.stringify(times), by]
  ).catch(() => null);
}

export async function takeOnBooking(appraisalId: string): Promise<TakeOnBooking | null> {
  if (!hasDb()) return null;
  const rows = await q<{ payload: TakeOnBooking }>(`SELECT payload FROM os_case_state WHERE kind = $1 AND record_id = $2`, [BOOKED, appraisalId]).catch(() => []);
  return rows[0]?.payload ?? null;
}

export async function recordTakeOnBooked(appraisalId: string, booking: TakeOnBooking): Promise<void> {
  if (!hasDb()) return;
  await q(
    `INSERT INTO os_case_state (kind, record_id, payload, updated_at, updated_by)
     VALUES ($1, $2, $3::jsonb, NOW(), $4)
     ON CONFLICT (kind, record_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
    [BOOKED, appraisalId, JSON.stringify(booking), booking.by]
  ).catch(() => null);
}

/**
 * HOW WE GET IN, FROM WHAT THEY TOLD US (James, 17 Sep 2026: "confirm via
 * tenant, confirm via landlord, vacant"). Read off the property questions,
 * so the agent is not guessing who to ring before a photographer turns up.
 */
export async function accessLine(appraisalId: string): Promise<{ label: string; detail: string } | null> {
  const answers: Record<string, unknown> = await readAnswers(appraisalId).catch(() => ({}));
  const who = typeof answers.occupancy === "string" ? answers.occupancy : null;
  const keys = typeof answers.keys === "string" ? answers.keys : null;
  const free = typeof answers["available-from"] === "string" ? (answers["available-from"] as string).trim() : "";
  const keyWords =
    keys === "we-hold" ? "We hold a set of keys." : keys === "keysafe" ? "There is a key safe at the property." : keys === "you-hold" ? "The landlord holds the keys." : keys === "tenant" ? "The tenant holds the keys." : "";
  if (who === "tenant") return { label: "Confirm with the tenant", detail: [`A tenant is living there${free ? `, free from ${free}` : ""}.`, keyWords].filter(Boolean).join(" ") };
  if (who === "owner") return { label: "Confirm with the landlord", detail: [`The landlord is living there${free ? `, free from ${free}` : ""}.`, keyWords].filter(Boolean).join(" ") };
  if (who === "empty") return { label: "Vacant", detail: keyWords || "Nobody is living there." };
  return null;
}

/* ── the confirmation, the same shape as the appraisal's ─────────────────── */

const key = (id: string) => `takeon|${id}`;

const howLong = (m: number) =>
  m % 60 === 0 ? (m === 60 ? "an hour" : `${m / 60} hours`) : m === 90 ? "an hour and a half" : `${m} minutes`;

function words(ma: MarketAppraisal, startsAt: string, minutes: number, agent: string, lines?: string) {
  const when = new Date(startsAt).toLocaleString("en-GB", {
    timeZone: "Europe/London",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const subject = `Confirmed - photographs at ${ma.address.split(",")[0].trim() || ma.address}, ${when}`;
  const body = [
    `Hi ${ma.landlord.trim().split(/\s+/)[0] || "there"},`,
    "",
    `That's the visit booked in for **${when}**, at ${ma.address}. It takes about ${howLong(minutes)}.`,
    "",
    "**What happens on the day**",
    "",
    `${agent} takes the photographs, measures up for the floor plan, and notes the details that go on the advert - room sizes, heating, parking, what is included.`,
    "",
    "It helps if the rooms are clear and the beds are made. Bins out of shot, curtains open, lights on in the darker rooms - it makes more difference to the photographs than anything we can do afterwards.",
    "",
    ...(lines ? [lines] : []),
    "If that time stops working, reply to this email and we'll move it.",
    "",
    agent,
    "The Letting Experts",
  ].filter((l, i, all) => !(l === "" && all[i - 1] === ""));
  return { subject, text: body.join("\n") };
}

export async function draftTakeOnConfirmation(input: { ma: MarketAppraisal; me: OsUser; startsAt: string; minutes: number; origin?: string }) {
  const { ma, me, startsAt, minutes } = input;
  const to = (ma.landlordEmail ?? "").trim();
  const links = input.origin
    ? calendarLinks(
        {
          title: `Photographs and floor plan - ${ma.address}`,
          startsAt,
          minutes,
          location: ma.address,
          details: `With ${me.name || "The Letting Experts"}.`,
          uid: `takeon-${ma.id}`,
        },
        input.origin
      )
    : null;
  const { subject, text } = words(ma, startsAt, minutes, me.name || "The Letting Experts", links ? calendarLinesFor(links) : undefined);
  const prev = await lastSent(key(ma.id));
  return {
    ok: true as const,
    to: to.includes("@") ? to : null,
    toName: ma.landlord,
    subject,
    html: renderPlain(subject, text).html,
    blocked: to.includes("@") ? undefined : "The landlord has no email address on the file, so this cannot go.",
    alreadySent: prev && isRepeat(prev, startsAt) ? { at: prev.sentAt, to: prev.to, subject: prev.subject } : undefined,
    attachment: null,
  };
}

export async function sendTakeOnConfirmation(input: {
  ma: MarketAppraisal;
  me: OsUser;
  startsAt: string;
  minutes: number;
  subject?: string;
  html?: string;
  again?: boolean;
  origin?: string;
}): Promise<{ sent: boolean; to?: string; reason?: string; detail?: string }> {
  const { ma, me, startsAt, minutes } = input;
  const to = (ma.landlordEmail ?? "").trim();
  if (!to.includes("@")) return { sent: false, reason: "The landlord has no email address on their record." };
  const prev = await lastSent(key(ma.id));
  if (isRepeat(prev, startsAt) && !input.again) {
    return { sent: false, to, reason: `Already sent to ${prev!.to} on ${sentWords(prev!.sentAt)}.` };
  }
  const draft = await draftTakeOnConfirmation({ ma, me, startsAt, minutes, origin: input.origin });
  const subject = (input.subject ?? "").trim() || draft.subject;
  const html = input.html ? cleanEmailHtml(input.html) : draft.html;
  const out = await sendAsAgent({ me, to, subject, html });
  if (!out.sent) return { sent: false, to, reason: out.detail };
  await recordSent(key(ma.id), { sentAt: new Date().toISOString(), startsAt, to, subject, by: me.name || me.email });
  return { sent: true, to, detail: out.detail };
}
