"use client";

import { useEffect, useState } from "react";
import { ALL_OFF, type LookOn, type LookScreen } from "@/lib/new-look";

/**
 * Whether this screen is in the new look for whoever is signed in.
 *
 * Asked on page load and shared by every caller, with the last answer kept in
 * this browser so a reload paints the right look first time instead of
 * flashing the old screen. With no answer yet and nothing kept, it is null:
 * the caller shows its own loading state rather than guessing.
 *
 * Asked again, at most once a minute, when a screen that reads a switch opens
 * or the tab comes back into view - and at once when a switch is changed on
 * this browser (James, 26 Nov 2026: he turned Recruitment on in Admin and it
 * was not on Susan's rail, because the answer from the page load was kept
 * until a refresh). A switch now reaches an open browser without a reload.
 *
 * `?look=new` or `?look=old` in the address pins it either way on this browser,
 * so a screen can be compared side by side; `?look=auto` lets the switch decide
 * again. It changes what this browser draws, nothing else.
 */

const KEEP = "os-new-look-v1";
const FORCE = "os-new-look-force";

let answer: LookOn | null = null;
let asking: Promise<LookOn> | null = null;
let askedAt = 0;
/** How long an answer is trusted before a newly opened screen asks again. */
const TRUST_MS = 60_000;
const listeners = new Set<(on: LookOn) => void>();

function kept(): LookOn | null {
  try {
    const raw = window.localStorage.getItem(KEEP);
    return raw ? { ...ALL_OFF, ...(JSON.parse(raw) as Partial<LookOn>) } : null;
  } catch {
    return null;
  }
}

function forced(): "new" | "old" | null {
  try {
    const want = new URLSearchParams(window.location.search).get("look");
    if (want === "new" || want === "old") window.localStorage.setItem(FORCE, want);
    if (want === "auto") window.localStorage.removeItem(FORCE);
    const f = window.localStorage.getItem(FORCE);
    return f === "new" || f === "old" ? f : null;
  } catch {
    return null;
  }
}

function ask(): Promise<LookOn> {
  if (asking) return asking;
  askedAt = Date.now();
  asking = fetch("/api/new-look", { cache: "no-store" })
    /* Signed out (401) still answers "everything off", as it always has. */
    .then((r) => (r.ok || r.status === 401 ? r.json() : Promise.reject(new Error("no answer"))))
    .then((j: { on?: Partial<LookOn> }) => ({ ...ALL_OFF, ...(j.on ?? {}) }))
    /* A failed re-ask keeps what this page already knows, never flips a screen. */
    .catch(() => answer ?? kept() ?? { ...ALL_OFF })
    .then((on) => {
      answer = on;
      try {
        window.localStorage.setItem(KEEP, JSON.stringify(on));
      } catch {
        /* fine - next load asks again */
      }
      listeners.forEach((l) => l(on));
      return on;
    })
    .finally(() => {
      asking = null;
    });
  return asking;
}

/** Ask again now and tell every screen on the page. For the switches screen, after a change. */
export function refreshNewLook(): Promise<LookOn> {
  return ask();
}

let watching = false;
/** Ask again when the tab comes back into view, if the answer is over a minute old. */
function watchTab() {
  if (watching) return;
  watching = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && answer && Date.now() - askedAt > TRUST_MS) void ask();
  });
}

/**
 * `waitForOff`: a screen whose OLD look is expensive to start (the dashboard's
 * board asks for the whole lead, listing and application books, ~2 MB, the
 * moment it mounts) is not drawn old from a kept answer alone. A kept "new"
 * still paints at once; a kept "old" waits for this load's answer, so a
 * browser that last saw the switch off doesn't flash the old board - and pay
 * for its reads - on the first visit after the switch is turned on.
 */
export function useNewLook(screen: LookScreen, opts?: { waitForOff?: boolean }): boolean | null {
  const [on, setOn] = useState<boolean | null>(null);
  const waitForOff = Boolean(opts?.waitForOff);
  useEffect(() => {
    const f = forced();
    if (f) {
      setOn(f === "new");
      return;
    }
    const start = answer ?? kept();
    if (start && (answer || start[screen] || !waitForOff)) setOn(start[screen]);
    const l = (a: LookOn) => setOn(a[screen]);
    listeners.add(l);
    if (!answer || Date.now() - askedAt > TRUST_MS) void ask();
    watchTab();
    return () => {
      listeners.delete(l);
    };
  }, [screen, waitForOff]);
  return on;
}
