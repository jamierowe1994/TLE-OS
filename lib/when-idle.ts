/**
 * Run `fn` once the browser has a quiet moment - after the board has painted
 * and its reads have gone out. Used to fetch a drawer's code in the
 * background, so it is off the first load but already here by the time
 * anybody clicks a row (2 Oct 2026). Returns a cancel.
 */
export function whenIdle(fn: () => void, timeout = 2000): () => void {
  if (typeof window === "undefined") return () => undefined;
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(fn, { timeout });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(fn, 600);
  return () => window.clearTimeout(id);
}
