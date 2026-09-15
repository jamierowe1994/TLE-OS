/**
 * The browser's half of the self-reporting bugs (15 Sep 2026, lib/auto-bugs).
 *
 * A screen that gets a server error back, a script that throws, a screen that
 * crashes: each is posted to /api/bugs/auto without anybody pressing anything.
 * The person can still press the report button to say more.
 *
 * Once per thing per tab. A broken tile re-rendering forty times is one report,
 * and the server counts repeats across people anyway.
 */

const sent = new Set<string>();

/* Messages that are the browser's noise, not our fault. */
const NOISE = [/ResizeObserver loop/i, /Loading chunk \d+ failed/i, /AbortError/i, /NEXT_REDIRECT/i, /NEXT_NOT_FOUND/i];

export function autoReport(p: { what: string; status?: number | null; message: string }): void {
  try {
    if (typeof window === "undefined") return;
    if (NOISE.some((r) => r.test(p.message))) return;
    const key = `${p.what}|${p.status ?? ""}|${p.message.slice(0, 80)}`;
    if (sent.has(key) || sent.size > 200) return;
    sent.add(key);
    void fetch("/api/bugs/auto", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ what: p.what.slice(0, 160), status: p.status ?? null, message: p.message.slice(0, 500), path: window.location.pathname }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* never throw from the thing that reports throws */
  }
}
