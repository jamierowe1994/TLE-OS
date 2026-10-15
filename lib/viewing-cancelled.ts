import "server-only";
import { hasDb, q } from "@/lib/db";
import { dropFromHeldDiary } from "@/lib/diary-cache";
import type { Appt } from "@/lib/diary";
import { londonDayOffset, londonHHMM } from "@/lib/london-time";

/**
 * VIEWINGS CANCELLED IN THE OS (Lorna's ticket, 15 Oct 2026).
 *
 * Lorna cancelled Susan Stainton's 3pm viewing at 74 Anlaby Park Road North.
 * REX took the cancellation on the first press - and from then on REX simply
 * stops returning the entry, to a search or to a read by id. So nothing the
 * OS reads from REX could ever learn it was off: the held diary kept it until
 * its next read, the viewings ledger (os_viewings) kept it as booked for good
 * (its sweep only updates entries REX still returns), and her next two presses
 * were told "couldn't be read, nothing changed" while the screen said done.
 *
 * So the OS keeps its own word on it, one row per viewing in os_case_state
 * (kind "viewing-cancelled", record = the diary id, rex-... or os-...), and
 * every copy it holds is told at the same moment:
 *
 *   os_viewings       cancelled = TRUE (texts, the morning email, the tenant
 *                     file, the access board and the activity feed read it)
 *   os_appointments   cancelled_at set on our own row of it, if there is one
 *   held diary        the entry taken out now, not at the next REX read
 *
 * The diary also reads these rows fresh on every request (cancelledIds), so a
 * held copy from another process, or a REX read that raced the cancel, cannot
 * put it back.
 */

const KIND = "viewing-cancelled";

export interface CancelledViewing {
  at: string;
  by: string;
  byName: string;
  startsAt: string;
  mins: number;
  address: string;
  who: string;
  /** The diary owner's mailbox, so the twin in their Outlook can be matched. */
  agentEmail: string | null;
  reason: "organiser" | "applicant";
}

export async function recordViewingCancelled(viewingId: string, v: CancelledViewing): Promise<void> {
  if (!hasDb()) return;
  await q(
    `INSERT INTO os_case_state (kind, record_id, payload, updated_at, updated_by)
     VALUES ($1, $2, $3, NOW(), $4)
     ON CONFLICT (kind, record_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
    [KIND, viewingId, JSON.stringify(v), v.by]
  ).catch(() => null);
  if (viewingId.startsWith("rex-")) {
    await q(`UPDATE os_viewings SET cancelled = TRUE, status = 'Cancelled' WHERE id = $1`, [viewingId]).catch(() => null);
    await q(`UPDATE os_appointments SET cancelled_at = COALESCE(cancelled_at, NOW()) WHERE rex_event_id = $1`, [viewingId.slice(4)]).catch(() => null);
  } else if (viewingId.startsWith("os-")) {
    await q(`UPDATE os_appointments SET cancelled_at = COALESCE(cancelled_at, NOW()) WHERE id = $1`, [viewingId.slice(3)]).catch(() => null);
  }
  await dropFromHeldDiary(viewingId).catch(() => undefined);
}

/** Already called off in the OS: a second press must not email them twice. */
export async function viewingCancelledAlready(viewingId: string): Promise<CancelledViewing | null> {
  if (!hasDb()) return null;
  const rows = await q<{ payload: CancelledViewing }>(
    `SELECT payload FROM os_case_state WHERE kind = $1 AND record_id = $2`,
    [KIND, viewingId]
  ).catch(() => []);
  return rows[0]?.payload ?? null;
}

/** Everything cancelled whose time is still in the diary's window. */
export async function cancelledViewings(): Promise<Map<string, CancelledViewing>> {
  const out = new Map<string, CancelledViewing>();
  if (!hasDb()) return out;
  const rows = await q<{ record_id: string; payload: CancelledViewing }>(
    `SELECT record_id, payload FROM os_case_state
      WHERE kind = $1 AND (payload->>'startsAt')::timestamptz > NOW() - INTERVAL '30 days'`,
    [KIND]
  ).catch(() => []);
  for (const r of rows) out.set(r.record_id, r.payload);
  return out;
}

/**
 * The diary without what was cancelled here, and without the copy of it that
 * REX put in the agent's Outlook (Lorna's REX copies her diary into Outlook,
 * 13 of 14 entries twinned). While REX's entry was there the Outlook twin was
 * hidden as a duplicate; once REX's entry went, the twin was drawn on its own
 * and the viewing looked booked. A twin is the same person's Outlook entry at
 * the same start whose words name the viewer or the street.
 */
export function withoutCancelled<B extends { appts: Appt[] }>(book: B, gone: Map<string, CancelledViewing>): B {
  if (!gone.size) return book;
  const twins = [...gone.values()].map((v) => ({
    day: londonDayOffset(new Date(v.startsAt)),
    hhmm: londonHHMM(new Date(v.startsAt)),
    agentEmail: (v.agentEmail ?? "").toLowerCase(),
    /* The viewer's surname when there is one: a block of viewings puts several
       people at one street and one time, and only Susan's twin is hers. */
    words: [v.who.trim().split(/\s+/).length > 1 ? v.who.trim().split(/\s+/).pop()! : v.address.split(",")[0].trim()]
      .map((w) => w.toLowerCase())
      .filter((w) => w.length >= 3),
  }));
  const appts = book.appts.filter((a) => {
    if (gone.has(a.id)) return false;
    if (!a.fromOutlook) return true;
    const text = `${a.what} ${a.where}`.toLowerCase();
    return !twins.some(
      (t) =>
        t.hhmm === a.start &&
        t.day === a.day &&
        (!t.agentEmail || !a.agentEmail || t.agentEmail === a.agentEmail.toLowerCase()) &&
        t.words.some((w) => text.includes(w))
    );
  });
  return appts.length === book.appts.length ? book : { ...book, appts };
}
