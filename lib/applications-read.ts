import { keepJson } from "@/lib/page-cache";

/**
 * The Applications board's read - one address for the board, a let's own
 * page, the nav's warm-up and the drawer that forgets it after a save, so
 * they share one answer (lib/page-cache).
 *
 * quick=1 (James, 9 Nov 2026, "Yes, do it"): an agent whose board was last
 * built over ten minutes ago waited two to eight seconds for it to be built
 * again (p90 5.6 s in the live logs of 2-9 Nov). Now the server answers at
 * once from the last board, up to an hour old, with `stale: true`; the screen
 * says it is updating (components/BoardUpdating) and makes the second read,
 * fresh=1, which waits for the rebuild and swaps it in. Past the hour, or
 * never built, the first read waits as it always did.
 */
export const APPS_BOARD_URL = "/api/applications?limit=200&quick=1";
export const APPS_FRESH_URL = "/api/applications?limit=200&fresh=1";

type Answer = { applications?: unknown[]; error?: string };

/** The second read: waits for the rebuilt board, and keeps it as the board's answer. */
export async function readFreshBoard<T extends Answer>(): Promise<T> {
  const r = await fetch(APPS_FRESH_URL, { cache: "no-store" });
  const j = (await r.json()) as T;
  if (r.ok && !j.error && Array.isArray(j.applications)) keepJson(APPS_BOARD_URL, j);
  return j;
}
