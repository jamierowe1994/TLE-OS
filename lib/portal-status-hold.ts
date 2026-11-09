/**
 * WHICH OFFLINE ADVERTS THE PORTALS STILL SHOW - HELD, AND NEVER WAITED ON
 * (9 Nov 2026).
 *
 * The Listings board stamps "Still on the portals" on every listing the OS
 * has marked Offline whose feed is still running (lib/advert-offline). It did
 * that by asking REX for every one of them on every load of the board, then
 * waiting up to 2.5 s for the answers - while the comment above it promised
 * "the board never waits on it". On 8 Nov the take-down of moved-in homes
 * marked 97 listings Offline in one go, and from then on every cold board
 * load sent REX 97 reads at once and waited out the whole 2.5 s: Listings went
 * from a 0.4 s median to 2.5 s (a tight cluster at 2.4-3.0 s in the live
 * logs: 1% of loads before, 38% after) while REX, kept busy answering them,
 * answered everything else slower too.
 *
 * Now the answer is HELD, per listing, and the board takes what is held at
 * once:
 *
 *   - younger than `freshMs`: used as it is, nothing asked
 *   - older, up to `keepMs`: still used, and a new read runs BEHIND the
 *     response (the next load has it) - a listing's feed changes at the
 *     portals' pace, not the board's
 *   - never held, or older than `keepMs`: not stamped, and read behind - the
 *     listing's own page reads its feed live, as it always did
 *   - the reads behind go a few at a time (`parallel`), not all at once, and
 *     a read that fails is not repeated for a minute and never replaces the
 *     last real answer with a guess
 *   - kept in the database too (`save`/`load`), so a deploy does not blank
 *     the stamps on the first board after it
 *
 * Nothing here knows about REX or Next: the caller passes the read, the way
 * to run work behind a response, and the store. That keeps it testable with
 * a fake clock and a fake REX.
 */

export type PortalRead = (listingId: string) => Promise<boolean | null>;

export interface HeldPortalAnswer {
  /** When it was read. */
  at: number;
  /** True while the feed still shows the advert. */
  on: boolean;
}

export interface PortalStatusHoldOptions {
  /** Younger than this: used as it is. */
  freshMs: number;
  /** Older than `freshMs` but younger than this: used while a new read runs behind. */
  keepMs: number;
  /** Reads in flight at once, behind a response. */
  parallel: number;
  /** A read that has not answered by now counts as failed (default 20 s), so one hung call cannot hold a listing back for good. */
  readTimeoutMs?: number;
  /** One listing's feed: true = still showing, false = gone, null = could not tell. */
  read: PortalRead;
  /** Run this after the response has gone. Default: right away, unawaited. */
  later?: (work: () => Promise<void>) => void;
  /** The held answers kept from before (a deploy, a restart). */
  load?: () => Promise<Record<string, HeldPortalAnswer> | null>;
  /** Keep the held answers. Never awaited by a caller. */
  save?: (all: Record<string, HeldPortalAnswer>) => Promise<void>;
  now?: () => number;
}

/** A read that failed is not tried again for this long. */
const RETRY_MS = 60_000;

export function createPortalStatusHold(opts: PortalStatusHoldOptions) {
  const now = opts.now ?? Date.now;
  const later = opts.later ?? ((work) => void work());
  const readTimeoutMs = opts.readTimeoutMs ?? 20_000;
  const held = new Map<string, HeldPortalAnswer>();
  const reading = new Set<string>();
  const failedAt = new Map<string, number>();
  let loading: Promise<void> | null = null;

  /* The kept answers come back once per process, before the first board. */
  const loadOnce = (): Promise<void> =>
    (loading ??= (async () => {
      if (!opts.load) return;
      try {
        const kept = await opts.load();
        if (!kept) return;
        for (const [id, a] of Object.entries(kept)) {
          if (a && typeof a.at === "number" && typeof a.on === "boolean" && !held.has(id)) held.set(id, a);
        }
      } catch {
        /* a store that will not answer is a board without stamps for a moment, not a broken one */
      }
    })());

  const snapshot = (): Record<string, HeldPortalAnswer> => {
    const t = now();
    const out: Record<string, HeldPortalAnswer> = {};
    for (const [id, a] of held) if (t - a.at < opts.keepMs) out[id] = a;
    return out;
  };

  async function refresh(ids: string[]): Promise<void> {
    const queue = [...ids];
    const worker = async () => {
      for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
        try {
          let timer: ReturnType<typeof setTimeout> | undefined;
          const on = await Promise.race([
            opts.read(id),
            new Promise<null>((resolve) => {
              timer = setTimeout(() => resolve(null), readTimeoutMs);
            }),
          ]).finally(() => clearTimeout(timer));
          if (on === null) failedAt.set(id, now());
          else {
            held.set(id, { at: now(), on });
            failedAt.delete(id);
          }
        } catch {
          failedAt.set(id, now());
        } finally {
          reading.delete(id);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(opts.parallel, ids.length) }, worker));
    if (opts.save) await opts.save(snapshot()).catch(() => {});
  }

  /** Of these listings, the ones the portals are still showing, as held. Never waits on REX. */
  async function check(ids: string[]): Promise<Set<string>> {
    await loadOnce();
    const t = now();
    const showing = new Set<string>();
    const toRead: string[] = [];
    for (const id of ids) {
      const a = held.get(id);
      const age = a ? t - a.at : Infinity;
      if (a && a.on && age < opts.keepMs) showing.add(id);
      if (age < opts.freshMs || reading.has(id)) continue;
      const failed = failedAt.get(id);
      if (failed !== undefined && t - failed < RETRY_MS) continue;
      toRead.push(id);
    }
    if (toRead.length) {
      for (const id of toRead) reading.add(id);
      later(() =>
        refresh(toRead).catch(() => {
          for (const id of toRead) reading.delete(id);
        })
      );
    }
    return showing;
  }

  /** The OS has just changed this listing (taken it offline, put it back): what was held is no longer a fact. */
  function forget(id: string): void {
    held.delete(id);
    failedAt.delete(id);
  }

  return { check, forget };
}
