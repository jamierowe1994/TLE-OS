import { after } from "next/server";
import { RULES } from "@/lib/staleness";
import { hasDb, q } from "@/lib/db";
import { closedReasons, getApplications } from "@/lib/applications";
import { stageLabels } from "@/lib/application-journey";

/* Moved here from app/api/applications/route.ts (2 Oct 2026) so the listing
   drawer's own applications read (/api/listings/[id]/applications) shares
   the Applications board's held copy instead of building its own. */

/**
 * The applications with their stage and their closed reason, assembled once
 * per book and kept (19 Sep 2026; made stale-while-revalidate 2 Oct 2026).
 *
 * The dashboard tile and the board both ask for this, often at the same
 * moment, and one assembly is three REX pages, the open-applications pull,
 * the let-or-withdrawn lookup and the Propoly deals - two to eight seconds.
 * Held only for a minute in memory, every caller after the minute paid all of
 * that again (p50 2.3 s, p99 7.9 s in production). Now:
 *
 *   • fresh for two minutes - served as it is
 *   • up to an hour - served at once, and a new assembly runs BEHIND the
 *     response (after()), so the next caller has it. Every figure in it is
 *     still REX's own last real answer; nothing is made up or carried over
 *     from a sample. Past the hour the caller waits for a new one.
 *   • kept in os_cache too, so a deploy does not hand the first person in a
 *     cold eight-second board
 *   • one assembly per BOOK (the business, or one agent), always at the
 *     largest size anybody asks for, and cut down per caller - the board asks
 *     for 200 and the drawer and dashboard for 300, which used to be two
 *     separate assemblies of the same applications
 *   • callers arriving together share one assembly rather than racing two
 *
 * Filing an application through the POST below marks every held copy as out
 * of date, so the person who just filed one waits for it rather than being
 * shown the board without it.
 */
export type Assembled = { applications: Awaited<ReturnType<typeof getApplications>>; stages: Map<string, string>; closed: Map<string, string> };
type Held = { at: number; value: Assembled };
export const ASSEMBLE_AT = 300; // the most any caller may ask for (see GET)
/* The application rule in lib/staleness, not numbers of our own: fresh for a
   minute, never shown past ten. In between the held board is answered at once
   with `stale: true` while the rebuild runs, and the board reads again a few
   seconds later to pick that rebuild up - so two people on one deal still
   agree within the minute, without the 2-8 s wait on every first look. */
const FRESH_MS = RULES.application.freshMs;
const KEEP_MS = RULES.application.keepMs;
const CACHE_KEY_BASE = "applications:assembled:v1";
const cacheKeyFor = (rexUserId: string | null) => `${CACHE_KEY_BASE}:${rexUserId ?? "all"}`;

/* On globalThis, like the Propoly token, so dev HMR and any second module
   instance share one copy and one assembly in flight. */
const G = globalThis as unknown as {
  __applicationsBoard?: { held: Map<string, Held>; assembling: Map<string, Promise<Held>>; dirtyAt: number };
};
const board = (G.__applicationsBoard ??= { held: new Map(), assembling: new Map(), dirtyAt: 0 });

async function readStored(key: string): Promise<Held | null> {
  if (!hasDb()) return null;
  try {
    const rows = await q<{ payload: { applications: Assembled["applications"]; stages: [string, string][]; closed: [string, string][] }; computed_at: Date }>(
      "SELECT payload, computed_at FROM os_cache WHERE key = $1",
      [key]
    );
    const row = rows[0];
    if (!row || !Array.isArray(row.payload?.applications)) return null;
    return {
      at: new Date(row.computed_at).getTime(),
      value: { applications: row.payload.applications, stages: new Map(row.payload.stages ?? []), closed: new Map(row.payload.closed ?? []) },
    };
  } catch {
    return null;
  }
}

async function store(key: string, h: Held): Promise<void> {
  if (!hasDb()) return;
  try {
    await q(
      `INSERT INTO os_cache (key, payload, computed_at) VALUES ($1, $2, to_timestamp($3 / 1000.0))
       ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, computed_at = EXCLUDED.computed_at`,
      [key, JSON.stringify({ applications: h.value.applications, stages: [...h.value.stages], closed: [...h.value.closed] }), h.at]
    );
  } catch {
    /* a cache that won't write is a slower board, not a broken one */
  }
}

function assemble(rexUserId: string | null): Promise<Held> {
  const key = cacheKeyFor(rexUserId);
  const running = board.assembling.get(key);
  if (running) return running;
  /* Stamped when the read STARTS: an application filed while this one was
     in flight is not in it, and dirtyAt has to be able to say so. */
  const started = Date.now();
  const p: Promise<Held> = (async () => {
    const applications = await getApplications(ASSEMBLE_AT, rexUserId);
    /* Where each one has actually GOT TO, rather than which of REX's four
       statuses it is on. One Propoly call for the whole page - see
       stageLabels(). It never fails the request: a list that says
       "Accepted" is worse than one that says "Signing & move-in monies",
       but it is far better than no list. */
    /* And which of them are really over, though REX still calls them open -
       moved in, or the home gone to someone else. See closedReasons(). */
    const [stages, closed] = await Promise.all([
      stageLabels(applications).catch(() => new Map<string, string>()),
      closedReasons(applications).catch(() => new Map<string, string>()),
    ]);
    const h: Held = { at: started, value: { applications, stages, closed } };
    if (started >= board.dirtyAt) {
      board.held.set(key, h);
      await store(key, h);
    }
    return h;
  })().finally(() => {
    if (board.assembling.get(key) === p) board.assembling.delete(key);
  });
  board.assembling.set(key, p);
  return p;
}

/**
 * The 300-assembly cut to what was asked for, exactly as getApplications
 * would have built it at that size: the newest `limit`, plus - for a pull of
 * 100 or more - every older one still open (received, communicated, or
 * accepted with move-in still ahead). See getApplications "EVERY OPEN ONE".
 */
export function cut(apps: Assembled["applications"], limit: number): Assembled["applications"] {
  if (apps.length <= limit) return apps;
  if (limit < 100) return apps.slice(0, limit);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const open = (a: Assembled["applications"][number]) =>
    a.status === "received" || a.status === "communicated" ||
    (a.status === "accepted" && !(a.startDate && a.startDate.slice(0, 10) < today));
  return [...apps.slice(0, limit), ...apps.slice(limit).filter(open)];
}

/** The book for this scope: held if fresh, held and refreshed behind if not
    too old, otherwise assembled while the caller waits. */
export async function assembled(rexUserId: string | null): Promise<{ held: Held; stale: boolean }> {
  const key = cacheKeyFor(rexUserId);
  let h: Held | null | undefined = board.held.get(key);
  if (!h) {
    h = await readStored(key);
    if (h) board.held.set(key, h);
  }
  /* Older than the last application filed here: not to be shown at all. */
  if (h && h.at < board.dirtyAt) h = null;
  const age = h ? Date.now() - h.at : Infinity;
  if (h && age < FRESH_MS) return { held: h, stale: false };
  if (h && age < KEEP_MS) {
    after(() => assemble(rexUserId).catch(() => {
      /* REX busy: the held copy stands and the next caller tries again */
    }));
    return { held: h, stale: true };
  }
  return { held: await assemble(rexUserId), stale: false };
}

/** An application has just been filed: nothing held before now may be shown. */
export function markApplicationsFiled(): void {
  board.held.clear();
  board.assembling.clear();
  board.dirtyAt = Date.now();
}
