import "server-only";
import { hasDb, q } from "@/lib/db";

/**
 * BOOKING CONFIRMATIONS ARE SEEN BEFORE THEY GO (James, 17 Sep 2026).
 *
 * "What we don't want to do is for emails to be sent out and for them not to
 * be aware." Booking a viewing or an appraisal used to send the customer's
 * confirmation the moment it was saved, and every later save of the same
 * appraisal sent it again - James's test appraisal, booked at 11:00 and moved
 * to 8:30 ten minutes later, confirmed twice with nothing to say the second
 * replaced the first.
 *
 * Now booking only books. The agent is shown the email, can rewrite any of
 * it, and presses Send. This file is the record of what went, so the same
 * appointment is never confirmed twice without the agent saying so, and a
 * moved one says it has moved.
 *
 * One row per appointment in os_case_state (kind 'confirmation-sent'):
 *   appraisal|<appraisal id>                          the latest send, whatever time
 *   viewing|<lead id>|<listing id>|<start ISO>        one per viewing slot
 */

const KIND = "confirmation-sent";

export interface SentRecord {
  sentAt: string;
  startsAt: string | null;
  to: string;
  subject: string;
  by: string;
}

export async function lastSent(key: string): Promise<SentRecord | null> {
  if (!hasDb()) return null;
  const rows = await q<{ payload: SentRecord }>(
    `SELECT payload FROM os_case_state WHERE kind = $1 AND record_id = $2`,
    [KIND, key]
  ).catch(() => []);
  return rows[0]?.payload?.sentAt ? rows[0].payload : null;
}

export async function recordSent(key: string, rec: SentRecord): Promise<void> {
  if (!hasDb()) return;
  await q(
    `INSERT INTO os_case_state (kind, record_id, payload, updated_at, updated_by)
     VALUES ($1, $2, $3::jsonb, NOW(), $4)
     ON CONFLICT (kind, record_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
    [KIND, key, JSON.stringify(rec), rec.by]
  ).catch(() => null);
}

/** Same appointment, same time: sending again needs the agent to say so. */
export function isRepeat(prev: SentRecord | null, startsAt: string | null): boolean {
  if (!prev) return false;
  return sameInstant(prev.startsAt, startsAt);
}

/** Confirmed before at a different time: the new email says it has moved. */
export function hasMoved(prev: SentRecord | null, startsAt: string | null): boolean {
  if (!prev || !prev.startsAt || !startsAt) return false;
  return !sameInstant(prev.startsAt, startsAt);
}

function sameInstant(a: string | null, b: string | null): boolean {
  if (!a || !b) return a === b;
  return new Date(a).getTime() === new Date(b).getTime();
}

/**
 * The agent's edit of the email, made safe to send.
 *
 * The body is edited in place in the preview, so what comes back is the
 * whole rendered document with their words in it. Staff are signed in and it
 * goes to one customer, but a pasted script or an inline handler has no place
 * in an email, so both go.
 */
export function cleanEmailHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/\s(on\w+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(contenteditable|designmode|spellcheck)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"');
}

/** "Wednesday 17 September at 8:02am", for "already sent" lines. */
export function sentWords(iso: string): string {
  const d = new Date(iso);
  return d
    .toLocaleString("en-GB", { timeZone: "Europe/London", weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", hour12: true })
    .replace(/,? (\d)/, " at $1")
    .replace(/\s?(am|pm)$/i, (m) => m.trim().toLowerCase());
}
