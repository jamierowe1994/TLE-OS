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

import { looksLikeOldCode, newBuildIsLive } from "@/lib/new-build";
import { toast } from "@/lib/toast";
import { trail } from "@/lib/trail";

const sent = new Set<string>();
let toldUpdated = false;

/* Messages that are the browser's noise, not our fault. */
const NOISE = [/ResizeObserver loop/i, /Loading (CSS )?chunk \S+ failed/i, /AbortError/i, /NEXT_REDIRECT/i, /NEXT_NOT_FOUND/i];

/** What a report carries besides its words: where in the code, and what was on the screen. */
export type ReportDetail = Record<string, string | number | string[] | null>;

/**
 * WHERE IT HAPPENED (24 Nov 2026). "Minified React error #185" arrived four
 * times from one agent on three screens with nothing but those words, and two
 * fixes were made on a guess at the wrong window. A script error now says
 * where in the code it was thrown and what was open when it was: the windows
 * on screen, what had focus (never what was typed), the size of the screen and
 * the last few steps. Read only, and never allowed to throw.
 */
export function whereItHappened(e?: { error?: unknown; filename?: string; lineno?: number; colno?: number } | null): ReportDetail {
  try {
    const cut = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n);
    const stack = String((e?.error as { stack?: unknown } | undefined)?.stack ?? "");
    const at = document.activeElement as HTMLElement | null;
    const label = (el: Element) => cut(el.getAttribute("aria-label") || (el.querySelector("h1, h2, h3") as HTMLElement | null)?.innerText || "", 60);
    return {
      stack: stack ? stack.replace(window.location.origin, "").slice(0, 1800) : null,
      at: e?.filename ? `${e.filename.replace(window.location.origin, "")}:${e.lineno ?? 0}:${e.colno ?? 0}` : null,
      open: [...new Set(Array.from(document.querySelectorAll('[role="dialog"], .nl-fs-wrap, .fixed.inset-0')).slice(0, 8).map(label).filter(Boolean))],
      focus: at && at !== document.body ? cut(`${at.tagName.toLowerCase()}${at.id ? `#${at.id}` : ""}${at.getAttribute("data-steve") ? ` [${at.getAttribute("data-steve")}]` : ""}${at.getAttribute("name") ? ` name=${at.getAttribute("name")}` : ""}`, 120) : null,
      screen: `${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio}`,
      scrollbar: window.innerWidth - document.documentElement.clientWidth,
      look: document.querySelector("[data-look]")?.getAttribute("data-look") ?? null,
      steps: trail().slice(-12).map((l) => cut(`${Math.round((Date.now() - l.at) / 1000)}s ago ${l.kind} ${l.text}`, 110)),
    };
  } catch {
    return {};
  }
}

export function autoReport(p: { what: string; status?: number | null; message: string; detail?: ReportDetail }): void {
  try {
    if (typeof window === "undefined") return;
    if (NOISE.some((r) => r.test(p.message))) return;
    const key = `${p.what}|${p.status ?? ""}|${p.message.slice(0, 80)}`;
    if (sent.has(key) || sent.size > 200) return;
    sent.add(key);
    /* A tab still on the build before a deploy (ticket a38f4a95, 17 Nov
       2026): not a fault, so not filed. The person is told once to refresh,
       which is all it needs. If the server is on the same build it is a real
       fault and goes in as one. */
    if (looksLikeOldCode(p.message)) {
      void newBuildIsLive().then((updated) => {
        if (!updated) return send(p);
        if (toldUpdated) return;
        toldUpdated = true;
        toast("The OS has just been updated. Refresh the page to carry on with the new version.", "bad", 20000);
      });
      return;
    }
    send(p);
  } catch {
    /* never throw from the thing that reports throws */
  }
}

function send(p: { what: string; status?: number | null; message: string; detail?: ReportDetail }): void {
  try {
    void fetch("/api/bugs/auto", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ what: p.what.slice(0, 160), status: p.status ?? null, message: p.message.slice(0, 500), path: window.location.pathname, detail: p.detail }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* never throw from the thing that reports throws */
  }
}
