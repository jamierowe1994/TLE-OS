import "server-only";
import { hasDb, q } from "@/lib/db";
import type { Appt } from "@/lib/diary";

/**
 * DOES THIS PERSON'S REX COPY ITS DIARY INTO THEIR OUTLOOK?
 *
 * Howard, 24 Sep 2026: "Booked a viewing and I have two appointments in my
 * diary." A booking goes into his Outlook directly (lib/outlook-calendar) AND
 * into REX (lib/rex-diary-write) - and his REX is set to copy its own diary
 * into Outlook, so REX's copy arrived as a second entry. James chose: for
 * anyone whose REX does that, the OS stops writing its own Outlook entry and
 * lets REX's copy be the one.
 *
 * ── How we know ───────────────────────────────────────────────────────────
 *
 * Nobody can ask REX. But the diary now reads both calendars side by side
 * (app/api/diary + lib/outlook-diary), so it can see it happening: when their
 * REX entries turn up in Outlook as well, at the same time and length, REX is
 * copying them. Most of them, on: few of them, off. In between, or too few to
 * tell, the last answer stands. Each diary read refreshes it.
 *
 * ── Failing safe ──────────────────────────────────────────────────────────
 *
 * The cost of a wrong ON is a booking missing from Outlook, which is worse
 * than a duplicate. So an answer older than a fortnight counts as unknown
 * (off), and the booking routes only skip Outlook once REX has actually
 * accepted the entry.
 */

const KIND = "rex-outlook-sync";
const STALE_MS = 14 * 86_400_000;
/** Enough REX entries to judge by. */
const ENOUGH = 3;

export async function rexCopiesToOutlook(userId: string): Promise<boolean> {
  if (!hasDb() || !userId) return false;
  const rows = await q<{ payload: { on?: boolean; at?: string } }>(
    `SELECT payload FROM os_case_state WHERE kind = $1 AND record_id = $2`,
    [KIND, userId]
  ).catch(() => []);
  const p = rows[0]?.payload;
  if (!p?.on || !p.at) return false;
  return Date.now() - new Date(p.at).getTime() < STALE_MS;
}

/**
 * Read it off their diary: their own REX entries, and their Outlook entries
 * that the OS did not write. Fire and forget from the diary route.
 */
export async function noteRexOutlookSync(userId: string, theirs: Appt[], outlook: Appt[]): Promise<void> {
  if (!hasDb() || !userId) return;
  /* A fortnight either side of today: recent enough to be the current setting. */
  const rex = theirs.filter((a) => a.fromRex && !a.allDay && a.day >= -7 && a.day <= 14);
  if (rex.length < ENOUGH) return;
  const copies = outlook.filter((o) => o.fromOutlook && !o.fromOs);
  const twinned = rex.filter((a) => copies.some((o) => o.day === a.day && o.start === a.start && o.mins === a.mins)).length;
  const share = twinned / rex.length;
  const on = share >= 0.7 ? true : share <= 0.2 ? false : null;
  if (on === null) return;
  await q(
    `INSERT INTO os_case_state (kind, record_id, payload, updated_at, updated_by)
     VALUES ($1, $2, $3::jsonb, NOW(), $2)
     ON CONFLICT (kind, record_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
    [KIND, userId, JSON.stringify({ on, at: new Date().toISOString(), twinned, of: rex.length })]
  ).catch(() => null);
}
