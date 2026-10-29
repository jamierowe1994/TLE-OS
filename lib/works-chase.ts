import "server-only";
import { hasDb, q } from "@/lib/db";
import { getOrder, logEvent, type WorksOrder } from "@/lib/works-orders";
import { emailsForMove, outcomeLine, type SendOutcome } from "@/lib/works-emails";
import { agentFor } from "@/lib/works-agent";
import { findUserById, type OsUser } from "@/lib/users";
import { neverSendsOut } from "@/lib/not-a-sender";
import { chaseOf, stopChase } from "@/lib/works-chase-store";
import { CHASE_FINAL_DAYS, CHASE_FIRST_DAYS, CHASE_GRACE_HOURS, chaseBlock, chaseLive, type WorksChase } from "@/lib/works-chase-rules";

/**
 * Chasing a contractor who hasn't come back (Sean McMahon, 26 Oct 2026).
 *
 *   Send a reminder now    the polite one, or the final one, there and then
 *   Set up reminders       the polite one after N days (7 unless they say),
 *                          the final one N days after that (3)
 *   the final              says: unless you come back within 48 hours we
 *                          have to cancel it with you, place it elsewhere,
 *                          and it won't be paid
 *   48 hours on            NOT cancelled on its own (James, on the call). The
 *                          agent is told on the job and in the bell, and
 *                          decides: place it elsewhere, or keep waiting
 *
 * It stops the moment the contractor comes back - a date, done, a file, the
 * invoice - or the job is cancelled or moves to someone else
 * (lib/works-chase-store stopChaseOnMove, from moveOrder). The timer is the
 * works sweep on the hourly reminders run (lib/works-sweep), and it only
 * emails in working hours, as the agent, the way every contractor email goes
 * (lib/works-emails). Every reminder is a line on the job.
 */

const DAY = 86_400_000;
const clampDays = (n: unknown, fallback: number) => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) && v >= 1 && v <= 60 ? v : fallback;
};
const dayWords = (d: Date) => d.toLocaleDateString("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short" });

/** Weekdays, 8am to 6pm in London: no contractor gets chased at midnight or on a Sunday. */
export function workingHours(now = new Date()): boolean {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const wd = f.find((p) => p.type === "weekday")?.value ?? "";
  const h = Number(f.find((p) => p.type === "hour")?.value ?? 0);
  return wd !== "Sat" && wd !== "Sun" && h >= 8 && h < 18;
}

/** A due date landing on a Saturday or Sunday moves to the Monday, so the date on the job is the day it goes. */
function onAWeekday(d: Date): Date {
  const out = new Date(d);
  for (let i = 0; i < 2; i += 1) {
    const wd = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short" }).format(out);
    if (wd !== "Sat" && wd !== "Sun") break;
    out.setTime(out.getTime() + DAY);
  }
  return out;
}

/** Set up (or change) the reminders on a job. Starts the polite one's clock now, unless it has already gone. */
export async function setChase(o: WorksOrder, firstDays: unknown, finalDays: unknown, me: OsUser, by: string): Promise<WorksChase> {
  const blocked = chaseBlock(o);
  if (blocked) throw new Error(`It can't be chased: ${blocked.charAt(0).toLowerCase()}${blocked.slice(1)}.`);
  const first = clampDays(firstDays, CHASE_FIRST_DAYS);
  const final = clampDays(finalDays, CHASE_FINAL_DAYS);
  const cur = await chaseOf(o.id);
  const live = chaseLive(cur) && cur.contractorId === o.contractorId ? cur : null;
  if (live?.finalAt) throw new Error("The final reminder has already gone. Wait for them, or place it elsewhere.");
  /* A reminder already gone (by hand) keeps its place: the final follows it. */
  const next = live?.remindedAt
    ? { kind: "final", at: onAWeekday(new Date(Math.max(Date.now(), new Date(live.remindedAt).getTime() + final * DAY))) }
    : { kind: "reminder", at: onAWeekday(new Date(Date.now() + first * DAY)) };
  await q(
    `INSERT INTO os_works_chases (order_id, contractor_id, contractor_name, first_days, final_days, set_at, set_by, set_by_id, next_kind, next_at, reminded_at, final_at, silent_at, stopped_at, stopped_why)
     VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8, $9, $10, NULL, NULL, NULL, '')
     ON CONFLICT (order_id) DO UPDATE SET contractor_id = EXCLUDED.contractor_id, contractor_name = EXCLUDED.contractor_name,
       first_days = EXCLUDED.first_days, final_days = EXCLUDED.final_days, set_at = NOW(), set_by = EXCLUDED.set_by, set_by_id = EXCLUDED.set_by_id,
       next_kind = EXCLUDED.next_kind, next_at = EXCLUDED.next_at, reminded_at = EXCLUDED.reminded_at,
       final_at = NULL, silent_at = NULL, stopped_at = NULL, stopped_why = ''`,
    [o.id, o.contractorId, o.contractorName, first, final, by, me.id, next.kind, next.at, live?.remindedAt ?? null]
  );
  const name = o.contractorName || "the contractor";
  await logEvent(
    o.id, by, "chase",
    next.kind === "final"
      ? `Reminders set for ${name}: the final reminder ${dayWords(next.at)}, ${final} day${final === 1 ? "" : "s"} after the last one. Stops the moment they come back.`
      : `Reminders set for ${name}: a reminder ${dayWords(next.at)}, then a final reminder ${final} day${final === 1 ? "" : "s"} after that. Stops the moment they come back.`
  );
  return (await chaseOf(o.id))!;
}

/**
 * One reminder, the polite one or the final, to the contractor on the job,
 * and the chase moved on. By hand (me is the person) or from the sweep (me is
 * whoever set it up). The outcome is the timeline line either way; nothing
 * moves on unless it went.
 */
export async function sendChase(o: WorksOrder, kind: "reminder" | "final", me: OsUser, by: string): Promise<SendOutcome> {
  const blocked = chaseBlock(o);
  if (blocked) throw new Error(`It can't be chased: ${blocked.charAt(0).toLowerCase()}${blocked.slice(1)}.`);
  const cur = await chaseOf(o.id);
  const live = chaseLive(cur) && cur.contractorId === o.contractorId ? cur : null;
  const [sent] = await emailsForMove(o, kind === "final" ? "chase_final" : "chase_reminder", me, { remindedAt: live?.remindedAt ?? null });
  const name = o.contractorName || "the contractor";
  const label = kind === "final" ? "Final reminder" : "Reminder";
  if (!sent?.sent) {
    await logEvent(o.id, by, "chase", `${label} to ${name} didn't go: ${(sent?.reason ?? "it could not be sent").replace(/\s*\u2014\s*/g, " - ").replace(/\.+$/, "")}.`);
    return sent ?? { to: "contractor", sent: false, reason: "it could not be sent" };
  }
  const via = sent.via === "the rehearsal" ? " - written and kept here, not sent" : sent.via === "own mailbox" ? `, from ${by === "TLE OS" ? `${me.name || "the agent"}'s` : "your own"} mailbox` : "";
  await logEvent(o.id, by, "chase", `${label} sent to ${name} at ${sent.address}${via}${sent.cc ? `, copying ${sent.cc} in` : ""}.`);
  if (kind === "final") {
    /* The 48 hours start now; whatever was planned before is replaced by the wait. */
    await q(
      `INSERT INTO os_works_chases (order_id, contractor_id, contractor_name, set_by, set_by_id, next_kind, next_at, final_at)
       VALUES ($1, $2, $3, $4, $5, 'silent', NOW() + make_interval(hours => $6), NOW())
       ON CONFLICT (order_id) DO UPDATE SET contractor_id = EXCLUDED.contractor_id, contractor_name = EXCLUDED.contractor_name,
         next_kind = 'silent', next_at = EXCLUDED.next_at, final_at = NOW(), silent_at = NULL, stopped_at = NULL, stopped_why = '',
         set_by = CASE WHEN os_works_chases.stopped_at IS NULL THEN os_works_chases.set_by ELSE EXCLUDED.set_by END,
         set_by_id = CASE WHEN os_works_chases.stopped_at IS NULL THEN os_works_chases.set_by_id ELSE EXCLUDED.set_by_id END`,
      [o.id, o.contractorId, o.contractorName, by, me.id, CHASE_GRACE_HOURS]
    );
  } else if (live?.finalDays != null && live.firstDays != null) {
    /* Set up with dates: the final follows this one by the days they chose. */
    await q(`UPDATE os_works_chases SET reminded_at = NOW(), next_kind = 'final', next_at = $2 WHERE order_id = $1`, [o.id, onAWeekday(new Date(Date.now() + live.finalDays * DAY))]);
  } else {
    /* By hand with nothing set up: noted, so the final can say "followed up on", and nothing planned. */
    await q(
      `INSERT INTO os_works_chases (order_id, contractor_id, contractor_name, set_by, set_by_id, reminded_at, next_kind, next_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NULL, NULL)
       ON CONFLICT (order_id) DO UPDATE SET contractor_id = EXCLUDED.contractor_id, contractor_name = EXCLUDED.contractor_name,
         reminded_at = NOW(), next_kind = NULL, next_at = NULL, final_at = NULL, silent_at = NULL, stopped_at = NULL, stopped_why = '',
         first_days = NULL, final_days = NULL, set_by = EXCLUDED.set_by, set_by_id = EXCLUDED.set_by_id`,
      [o.id, o.contractorId, o.contractorName, by, me.id]
    );
  }
  return sent;
}

/**
 * 48 hours after the final and nothing back: take it off them. They're told
 * it's cancelled with them (the works-contractor-cancelled email), the chase
 * stops, and the agent picks who does it instead. The job itself stays open.
 */
export async function releaseContractor(o: WorksOrder, me: OsUser, by: string): Promise<void> {
  const out = await emailsForMove(o, "cancel", me).catch(() => [] as SendOutcome[]);
  for (const e of out) await logEvent(o.id, "TLE OS", "email", outcomeLine(e));
  await stopChase(o.id, "taken off them to place it elsewhere", by);
}

/**
 * The timer (lib/works-sweep, on the hourly reminders run). What's due goes:
 * a reminder, a final reminder, or - 48 hours after the final - the job put in
 * front of the agent. Anything no longer waiting on that contractor stops.
 */
export async function runContractorChases(now = new Date()): Promise<{ sent: number; silent: number; stopped: number; waiting: number; failed: number }> {
  const tally = { sent: 0, silent: 0, stopped: 0, waiting: 0, failed: 0 };
  if (!hasDb()) return tally;
  const rows = await q<{ order_id: string }>(
    `SELECT order_id FROM os_works_chases WHERE stopped_at IS NULL AND next_at IS NOT NULL AND next_at <= $1 ORDER BY next_at LIMIT 50`,
    [now]
  ).catch(() => []);
  const hours = workingHours(now);
  for (const r of rows) {
    const found = await getOrder(r.order_id);
    const c = found?.order.chase;
    if (!found || !chaseLive(c)) continue;
    const o = found.order;
    const blocked = o.contractorId !== c.contractorId ? `the job moved to ${o.contractorName || "another contractor"}` : chaseBlock(o, now.getTime());
    if (blocked) {
      if (await stopChase(o.id, blocked.charAt(0).toLowerCase() + blocked.slice(1))) tally.stopped += 1;
      continue;
    }
    if (c.nextKind === "silent") {
      await q(`UPDATE os_works_chases SET silent_at = NOW(), next_kind = NULL, next_at = NULL WHERE order_id = $1 AND stopped_at IS NULL`, [o.id]);
      await logEvent(o.id, "TLE OS", "chase", `${CHASE_GRACE_HOURS} hours since the final reminder and nothing back from ${o.contractorName || "the contractor"}. Nothing has been cancelled: place it elsewhere, or keep waiting.`);
      tally.silent += 1;
      continue;
    }
    if (!hours) { tally.waiting += 1; continue; }
    const me = (c.setBy && (await setterOf(o.id))) || (await agentFor(o));
    if (!me) { tally.failed += 1; continue; }
    const sent = await sendChase(o, c.nextKind === "final" ? "final" : "reminder", me, "TLE OS").catch(() => null);
    if (sent?.sent) tally.sent += 1;
    else {
      /* Tried again tomorrow rather than every hour: one line a day on the job, not twenty. */
      await q(`UPDATE os_works_chases SET next_at = NOW() + interval '1 day' WHERE order_id = $1 AND stopped_at IS NULL`, [o.id]).catch(() => null);
      tally.failed += 1;
    }
  }
  return tally;
}

/** Whoever set the chase up: the reminders go out in their name, from their mailbox. */
async function setterOf(orderId: string): Promise<OsUser | null> {
  const [r] = await q<{ set_by_id: string | null }>(`SELECT set_by_id FROM os_works_chases WHERE order_id = $1`, [orderId]).catch(() => []);
  const who = r?.set_by_id ? await findUserById(r.set_by_id).catch(() => null) : null;
  /* Gone, locked, or James (lib/not-a-sender): the job's own agent sends it instead. */
  return who && !who.locked && !neverSendsOut(who.email) ? who : null;
}
