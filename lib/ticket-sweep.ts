import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { hasDb, q } from "@/lib/db";
import { tellReporter } from "@/lib/bug-bot";

/**
 * TICKETS THAT CLOSE THEMSELVES (James, 4 Nov 2026: "build ways to stop or get
 * rid of easy tickets that you can tick off without any help from me").
 *
 * Two kinds never needed him, and both sat on Tickets until he pressed them:
 *
 *   1. An outage on somebody else's side. lib/auto-bugs files REX, Propoly or
 *      Flatfair going quiet as one automatic ticket per system ("could not be
 *      reached", "slow or busy", screens that could not load while REX was
 *      down). 89 were closed Won't Fix by hand, every one after the outage had
 *      already ended. Nothing about them was ours to fix, so one that has been
 *      quiet for QUIET_HOURS closes itself, with a line saying when it was last
 *      seen and how many calls it caught. The next failure opens a fresh one,
 *      which is the right signal: it came back. A failure that keeps happening
 *      is never quiet, so it never closes.
 *
 *   2. A fix that is live. "Fixed means live" (15 Sep 2026), and the person
 *      who reported it is told then. A commit that fixes a ticket carries
 *      tickets/shipped/<ticket id>.json; when the deploy carrying it boots, the
 *      ticket is marked Fixed and the reporter gets the usual email. Nobody has
 *      to come back after the deploy to tick it. One file per ticket, so two
 *      branches never fight over a shared list.
 */

const QUIET_HOURS = 6;

/* The fingerprints lib/auto-bugs gives a failure on the other side: a system
   that did not answer at all, an endpoint that was slow or busy, and the
   screens that failed with REX. Anything else (a refused write, our own
   screen error) stays for a person. */
const THEIR_SIDE = `(fingerprint LIKE '%|unreachable' OR fingerprint LIKE '%|busy' OR fingerprint = 'Screen|rex-outage')`;

export async function closeClearedOutages(): Promise<number> {
  if (!hasDb()) return 0;
  const rows = await q<{ id: string }>(
    `UPDATE os_bugs
        SET state = 'wontfix', bot_state = 'not_a_bug', bot_at = NOW(),
            bot_note = 'Closed by itself: an outage on '
              || CASE WHEN fingerprint = 'Screen|rex-outage' THEN 'REX' ELSE split_part(fingerprint, '|', 1) END
              || '''s side, quiet since '
              || to_char(coalesce(last_seen_at, created_at) AT TIME ZONE 'Europe/London', 'DD Mon HH24:MI')
              || ' after ' || occurrences || CASE WHEN occurrences = 1 THEN ' call.' ELSE ' calls.' END
      WHERE kind = 'auto' AND state IN ('open','ack') AND ${THEIR_SIDE}
        AND coalesce(last_seen_at, created_at) < NOW() - INTERVAL '${QUIET_HOURS} hours'
      RETURNING id`
  );
  return rows.length;
}

const SHIPPED_DIR = path.join(process.cwd(), "tickets", "shipped");
const TICKET_ID = /^[A-Za-z0-9-]{8,64}$/;

/** The ticket ids this deploy carries a fix for. A missing folder is none. */
export async function shippedTicketIds(): Promise<string[]> {
  const names = await readdir(SHIPPED_DIR).catch(() => [] as string[]);
  const ids: string[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const id = name.slice(0, -5);
    if (!TICKET_ID.test(id)) continue;
    /* The file's own id wins when it has one, so a renamed file still points
       at the right ticket. A file that will not parse still counts by name. */
    const said = await readFile(path.join(SHIPPED_DIR, name), "utf8")
      .then((t) => (JSON.parse(t) as { id?: unknown }).id)
      .catch(() => undefined);
    ids.push(typeof said === "string" && TICKET_ID.test(said) ? said : id);
  }
  return [...new Set(ids)];
}

/**
 * Marks every ticket this deploy fixes as Fixed and tells each reporter once.
 * Ids are full ticket ids or the first eight characters, as commits quote
 * them; a short id that matches more than one ticket is left alone.
 */
export async function shipMarkedTickets(origin: string): Promise<string[]> {
  if (!hasDb()) return [];
  const ids = await shippedTicketIds();
  if (!ids.length) return [];
  /* Once per ticket, ever: the marker stays in the code for good, so a ticket
     somebody reopens after its fix went live must not be closed again by the
     next deploy. shippedAt in its context is that memory. */
  const rows = await q<{ id: string }>(
    `SELECT DISTINCT b.id FROM os_bugs b
       JOIN unnest($1::text[]) AS s(id) ON b.id = s.id OR (length(s.id) < 36 AND b.id LIKE s.id || '%')
      WHERE b.state IN ('open','ack') AND NOT coalesce(b.context, '{}'::jsonb) ? 'shippedAt'
        AND (SELECT count(*) FROM os_bugs x WHERE x.id = s.id OR (length(s.id) < 36 AND x.id LIKE s.id || '%')) = 1`,
    [ids]
  );
  const fixed: string[] = [];
  for (const { id } of rows) {
    const done = await q<{ id: string }>(
      `UPDATE os_bugs SET state = 'fixed',
              context = coalesce(context, '{}'::jsonb) || jsonb_build_object('shippedAt', NOW()),
              bot_note = CASE WHEN bot_note = '' THEN 'Fixed and live.' ELSE bot_note END
        WHERE id = $1 AND state IN ('open','ack') RETURNING id`,
      [id]
    );
    if (!done.length) continue;
    fixed.push(id);
    await tellReporter(id, origin).catch(() => false);
  }
  return fixed;
}

/** Both, for the timers. Never throws: a sweep that fails tries again next time. */
export async function sweepTickets(origin: string): Promise<{ outagesClosed: number; shipped: string[] }> {
  const outagesClosed = await closeClearedOutages().catch(() => 0);
  const shipped = await shipMarkedTickets(origin).catch(() => [] as string[]);
  return { outagesClosed, shipped };
}
