import "server-only";
import { hasDb } from "@/lib/db";
import { listMoveOuts, openMoveOuts } from "@/lib/move-outs";
import { openTasks } from "@/lib/rexpm-tasks";
import { listReviews } from "@/lib/tenancy-reviews";
import { latestSnapshots } from "@/lib/tenancy-archive";
import { countsOf, landlordsOf } from "@/lib/managed-book";
import { currentLets } from "@/lib/current-lets";
import type { ManagedBook, ManagedProperty } from "@/lib/portfolio-types";

/**
 * A tenant has given notice: the home stays on the book until they go
 * (James, 9 Oct 2026).
 *
 * "We need to make sure that that property stays on book until that tenant
 * officially moves out ... Until that tenant moves out, it's also classified
 * under the portfolio as a relet. If they would click relet that property,
 * it shouldn't take away from that portfolio until that tenant's moved out,
 * and then that's when it drops ... as the old tenant moves out, there might
 * be a few days where that drops off the portfolio, and then that moves back
 * in, therefore restarting the tenancy again."
 *
 * So, over the book as REX gives it:
 *
 *   - every home with an open move-out (notice recorded here, or REX PM's
 *     move-out list) is marked with its notice: a relet, leaving on a day.
 *   - a home with an open move-out that REX no longer shows as let - it was
 *     relisted in REX, or dropped off REX PM's list, before the tenants left
 *     (6 Ruskin Place, 9 Oct) - is put back from the tenancy archive, as
 *     Portfolio last drew it, and marked as held.
 *
 * "Officially moves out" is the move-out being closed as moved out
 * (lib/move-outs). A move-out whose day has passed but isn't closed is late,
 * not gone: the home stays until somebody says they've left. Once it is
 * closed the home drops off with REX, and the next let brings it back.
 */

export interface Notice {
  leavingOn: string | null;
  tenant: string;
}

/* The board changes when somebody records notice or closes a move-out, a
   few times a day. Every Portfolio read comes through here, so one minute
   in memory keeps it to one read of the lists a minute. */
let cached: { at: number; byKey: Map<string, Notice> } | null = null;
const FRESH_MS = 60_000;

/** Forget the cached board - after notice is recorded or a move-out closed. */
export function forgetNotices(): void {
  cached = null;
}

/** Open move-outs by REX property id and OS property id. */
export async function noticesByProperty(): Promise<Map<string, Notice>> {
  if (cached && Date.now() - cached.at < FRESH_MS) return cached.byKey;
  const byKey = new Map<string, Notice>();
  if (!hasDb()) return byKey;
  const [done, tasks, reviews] = await Promise.all([listMoveOuts(), openTasks("move_out").catch(() => []), listReviews()]);
  for (const m of openMoveOuts(tasks, reviews, done, [])) {
    const n: Notice = { leavingOn: m.moveOutOn, tenant: m.tenant };
    for (const k of [m.propertyId, m.osPropertyId]) {
      if (!k) continue;
      /* Two on one home: the sooner day is the one that matters. */
      const had = byKey.get(k);
      if (!had || (n.leavingOn && (!had.leavingOn || n.leavingOn < had.leavingOn))) byKey.set(k, n);
    }
  }
  cached = { at: Date.now(), byKey };
  return byKey;
}

const keysOf = (p: ManagedProperty) => [p.propertyId, p.listingId].filter(Boolean) as string[];

/* REX PM's move-out list is untidy: on 9 Oct 2026 it held 69 open move-outs,
   most with no day set and some from 2025 that nobody closed. Taken at face
   value that labelled 45 homes as relets. So a notice counts only when:
   - it has a leaving day, ahead or at most a month gone - a late move-out
     nobody closed doesn't make a home a relet forever (notice recorded here
     always has a day: the form asks for it);
   - it lands on the home's current let - an older let on record is history,
     and a let that started after the leaving day is the NEXT tenancy. */
const LATE_DAYS = 30;
const isOlderLet = (p: ManagedProperty, n: Notice) => Boolean(n.leavingOn && p.letSince && p.letSince.slice(0, 10) > n.leavingOn);
const live = (n: Notice | undefined, today: string) => {
  if (!n?.leavingOn) return false;
  const cut = new Date(`${today}T00:00:00Z`);
  cut.setUTCDate(cut.getUTCDate() - LATE_DAYS);
  return n.leavingOn >= cut.toISOString().slice(0, 10);
};

/**
 * The book with notice applied. Never throws: a board that can't be read
 * leaves the book exactly as REX gave it, which is the old behaviour.
 */
export async function withNotice(book: ManagedBook, rexUserId: string | null): Promise<ManagedBook> {
  let notices: Map<string, Notice>;
  try {
    notices = await noticesByProperty();
  } catch {
    return book;
  }
  if (!notices.size) return book;

  const today = new Date().toISOString().slice(0, 10);
  const current = new Set(currentLets(book.properties).map((p) => p.listingId));
  const seen = new Set<string>();
  const properties = book.properties.map((p) => {
    for (const k of keysOf(p)) seen.add(k);
    if (!current.has(p.listingId)) return p;
    const n = keysOf(p).map((k) => notices.get(k)).find((x) => live(x, today));
    return n && !isOlderLet(p, n) ? { ...p, notice: n } : p;
  });

  /* Homes under notice that REX has let go of. Only the ones the archive
     holds, and for an agent only their own - the archive row says whose. */
  const missing = [...new Set([...notices.keys()].filter((k) => !seen.has(k) && live(notices.get(k), today)))];
  let held: ManagedProperty[] = [];
  if (missing.length) {
    const snaps = await latestSnapshots(missing).catch(() => new Map<string, ManagedProperty>());
    held = [...snaps.entries()]
      .filter(([, snap]) => !rexUserId || snap.agent?.id === rexUserId)
      .filter(([, snap]) => !keysOf(snap).some((k) => seen.has(k)))
      .map(([k, snap]) => ({ ...snap, notice: notices.get(k), held: true }));
  }
  if (!held.length) return { ...book, properties };

  const all = [...properties, ...held];
  const landlords = landlordsOf(currentLets(all));
  /* REX PM's own counts (homes, occupied, vacant) are its own and stay. */
  const counts = { ...book.counts, ...countsOf(all, landlords) };
  counts.rentsFromPayProp = currentLets(all).filter((p) => p.rentSource === "payprop").length;
  return { ...book, properties: all, landlords, counts };
}
