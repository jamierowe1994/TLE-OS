"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import CrashScreen from "@/components/CrashScreen";
import { note } from "@/lib/trail";

/**
 * Keeps the trail, and notices when the OS goes quiet on somebody.
 *
 * ── The trail ─────────────────────────────────────────────────────────────
 *
 * Every page opened and every control clicked, into lib/trail. Nothing leaves
 * the browser until a report is filed; this only makes sure that when one is
 * filed it says what led up to it.
 *
 * ── The watch ─────────────────────────────────────────────────────────────
 *
 * James, 13 Sep 2026 asked for the error AND the timeout. A React crash lands
 * on the error boundary, but the worse failure during a pilot is the one with
 * no exception at all: a call that never comes back, a spinner that turns for
 * a minute, and an agent who quietly decides the system is slow and says
 * nothing. So our own calls are timed, and when one is still out after
 * STUCK_AFTER a bar appears offering the same one-button report.
 *
 * It watches OUR api only. A slow map tile or a font from Google is not a
 * fault worth interrupting anybody about.
 */

/** Long enough that a big REX pull is not an accusation. */
const STUCK_AFTER = 25_000;
/** Said once per page, so a bad screen does not nag. */
let barred = false;
/** Set while the tab is leaving: every request in flight fails on the way out
    and none of those failures is a fault worth recording. */
let leaving = false;

export default function Watchdog() {
  const pathname = usePathname();
  const [stuck, setStuck] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  /* Where they are. */
  useEffect(() => {
    if (pathname) note("went", pathname);
    barred = false;
    setStuck(null);
  }, [pathname]);

  /* What they pressed. Capture phase, so a control that stops the event -
     or throws on the way - is still recorded before it does. */
  useEffect(() => {
    const onGoing = () => {
      leaving = true;
    };
    window.addEventListener("pagehide", onGoing);
    window.addEventListener("beforeunload", onGoing);

    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.(
        "button, a, [role='button'], summary, label"
      ) as HTMLElement | null;
      if (!el) return;
      const said =
        el.getAttribute("aria-label") ||
        el.innerText ||
        el.getAttribute("title") ||
        el.tagName.toLowerCase();
      note("did", `"${said}"`);
    };
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("pagehide", onGoing);
      window.removeEventListener("beforeunload", onGoing);
    };
  }, []);

  /* Our own calls, timed. Patched once for the life of the tab: React strict
     mode mounts twice in development, and a patch of a patch would double
     every entry in the trail. */
  useEffect(() => {
    const w = window as Window & { __tleWatch?: boolean };
    if (w.__tleWatch) return;
    w.__tleWatch = true;

    const original = window.fetch;
    window.fetch = async function patched(input: RequestInfo | URL, init?: RequestInit) {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request)?.url ?? "";
      const ours = /^\/api\//.test(url) || url.startsWith(window.location.origin + "/api/");
      if (!ours) return original.call(this, input as RequestInfo, init);

      const short = url.replace(window.location.origin, "").split("?")[0];
      const started = Date.now();
      const timer = window.setTimeout(() => {
        if (leaving) return;
        note("slow", `${short} still going after ${Math.round(STUCK_AFTER / 1000)}s`);
        if (!barred) {
          barred = true;
          setStuck(short);
        }
      }, STUCK_AFTER);

      try {
        const res = await original.call(this, input as RequestInfo, init);
        window.clearTimeout(timer);
        const took = Date.now() - started;
        if (!res.ok) note("failed", `${short} came back ${res.status}`);
        else if (took > 6000) note("slow", `${short} took ${Math.round(took / 1000)}s`);
        return res;
      } catch (err) {
        window.clearTimeout(timer);
        /* A cancelled request is not a fault: React aborts them on purpose
           when a screen is left before its data lands. */
        const name = (err as Error)?.name ?? "";
        if (name !== "AbortError" && !leaving) note("failed", `${short} did not answer`);
        throw err;
      }
    };
    /* Deliberately never restored. Unpatching on unmount would leave the tab
       unwatched the moment any parent re-rendered, and the patch is harmless:
       it passes everything through and only ever writes to sessionStorage. */
  }, []);

  if (!stuck) return null;

  return (
    <>
      {/* Bottom LEFT: Steve sits bottom right, and two things in one corner
          is how a screen starts feeling broken on its own. */}
      <div
        data-hide-from-shot
        className="fixed bottom-5 left-5 z-[60] max-w-[380px] rounded-[14px] border border-line/70 bg-card px-4 py-3 shadow-lg"
      >
        <p className="text-[13.5px] font-semibold">This is taking longer than it should</p>
        <p className="mt-1 text-[12.5px] leading-snug text-muted">
          Something we asked for has not come back. It may still arrive, but it is worth us knowing either way.
        </p>
        <div className="mt-2.5 flex items-center gap-4">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-[10px] px-3.5 py-2 text-[12.5px] font-semibold text-white"
            style={{ background: "var(--accent-dark)" }}
          >
            Tell us about it
          </button>
          <button type="button" onClick={() => setStuck(null)} className="text-[12.5px] text-muted underline underline-offset-4">
            It is fine
          </button>
        </div>
      </div>

      {open && (
        <div
          data-hide-from-shot
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="max-h-[88vh] w-full max-w-[600px] overflow-y-auto rounded-[20px] bg-page">
            <CrashScreen
              headline="A screen that would not finish"
              what={`We were waiting on ${stuck} and it had not come back. Send it over and it arrives with the page, the wait and the last few things you did.`}
              kind="bug"
            />
          </div>
        </div>
      )}
    </>
  );
}
