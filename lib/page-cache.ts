/**
 * The last good answer for each board, kept in the tab between screens.
 *
 * James, 2 Oct 2026: "a butter-smooth system that has extremely fast load
 * times." Every board fetched on mount and showed a spinner until it answered,
 * so going Leads → Listings → Leads paid for the leads read twice and stared
 * at "Fetching your leads…" both times, though nothing had changed in between.
 *
 * Now a board paints the answer it had a moment ago straight away, and reads
 * again behind it - stale-while-revalidate, in the tab. That is not a stale
 * figure on the screen: the read is always made, the screen is always
 * corrected by it, and an answer older than HOLD_MS is never shown at all.
 * The rule is "live figures only", and a figure that is replaced in the same
 * second it appears is still the live one.
 *
 * Only GOOD answers are kept (the caller says what good is). A failure is
 * never held, so one bad read can't stick on a board.
 *
 * Module memory, so it dies with the tab - and a view-as start or stop sets
 * window.location (lib/me), which empties it, so one person's book never
 * paints under somebody else's name.
 */

type Entry = { at: number; json: unknown };

const HOLD_MS = 10 * 60 * 1000;
/* A read is shared only while it is still in flight - two mounts at once, or
   React's double mount in development. Once it lands it is let go, so a save
   followed by a visit always asks again. The one exception is the nav's
   warm-up (warmJson): its answer is held for a few seconds, for the screen
   the click is taking you to, and handed to that screen's first read only. */
const WARM_MS = 5 * 1000;

const kept = new Map<string, Entry>();
const flying = new Map<string, { at: number; p: Promise<unknown>; done?: boolean; warm?: boolean }>();

/** The last good answer for `url`, if there is a recent one. */
export function peekJson<T = unknown>(url: string): T | null {
  const e = kept.get(url);
  if (!e) return null;
  if (Date.now() - e.at > HOLD_MS) {
    kept.delete(url);
    return null;
  }
  return e.json as T;
}

/**
 * Read `url` now (joining a read already on the way, or a warm-up that landed
 * a moment ago). Resolves to the parsed JSON, or rejects on a network
 * failure. `good` decides whether the answer is worth keeping for next time.
 */
export function readJson<T = unknown>(url: string, good: (j: T) => boolean = () => true, warm = false): Promise<T> {
  let f = flying.get(url);
  /* Landed already: only a warm-up's answer is reused, once, and only fresh. */
  if (f?.done && (warm || !f.warm || Date.now() - f.at >= WARM_MS)) f = undefined;
  if (f?.done && !warm) flying.delete(url);
  /* A read that has hung for half a minute is not worth joining. */
  if (f && !f.done && Date.now() - f.at > 30 * 1000) f = undefined;
  if (!f) {
    const entry: { at: number; p: Promise<unknown>; done?: boolean; warm?: boolean } = {
      at: Date.now(),
      p: fetch(url, { cache: "no-store" }).then((r) => r.json()) as Promise<unknown>,
      warm,
    };
    flying.set(url, entry);
    entry.p.then(
      () => {
        entry.done = true;
        entry.at = Date.now();
        if (!entry.warm && flying.get(url) === entry) flying.delete(url);
      },
      /* A failure is let go at once, so the next mount tries again. */
      () => {
        if (flying.get(url) === entry) flying.delete(url);
      }
    );
    f = entry;
  } else if (!warm) {
    /* A board joining the warm-up's read: from here it is the board's. */
    f.warm = false;
  }
  /* Each caller judges the answer for itself: the prefetch keeps nothing,
     the board keeps it only if it is a real read. */
  return f.p.then((j) => {
    if (j && good(j as T)) kept.set(url, { at: Date.now(), json: j });
    return j as T;
  });
}

/** Start the read without waiting for it - the nav prefetch. */
export function warmJson(url: string): void {
  void readJson(url, () => false, true).catch(() => undefined);
}

/** Forget what we hold for `url` (after a save that changes it). */
export function dropJson(url: string): void {
  kept.delete(url);
  flying.delete(url);
}
