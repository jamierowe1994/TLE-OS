"use client";

import { useSyncExternalStore } from "react";
import type { Appt } from "@/lib/diary";
import { useReportReady } from "@/lib/reveal";

/**
 * One live copy of the diary, shared by every screen that shows it.
 *
 * Eight components read the diary — the week grid, the calendar, the booker,
 * the viewings page, the dashboard widget, the listing drawer. Threading
 * fetched data through all of them would mean a provider and eight prop
 * chains; instead there is one tiny store they all subscribe to.
 *
 * It starts EMPTY and loading, and fills the moment REX answers. It used to
 * start as the sample book "so nothing ever renders empty" - which meant a
 * slow or failed REX put "Viewing - 41 Harewood Road" on a real agent's
 * dashboard as if it were theirs. The rule is live figures or an honest
 * error, never a stand-in (James, 6 Sep 2026). `live` says whether REX
 * answered; `error` says why not.
 */

interface DiaryState {
  appts: Appt[];
  live: boolean;
  loading: boolean;
  agents: string[];
  /** True only for an owner: the whole office's diary, and the agent picker
   *  that goes with it. An agent's book is their own and needs no filter. */
  everything: boolean;
  /** Why the diary is not live, for the screens to say so. */
  error: string | null;
}

/** The server (and first client) snapshot must be the SAME object every
 *  time it's read — returning a fresh literal makes React re-render forever
 *  looking for a stable value. */
const INITIAL: DiaryState = { appts: [], live: false, loading: true, agents: [], everything: false, error: null };

let state: DiaryState = INITIAL;
const listeners = new Set<() => void>();
let started = false;

function set(next: DiaryState) {
  state = next;
  listeners.forEach((l) => l());
}

/** When the book on screen was last read. */
let loadedAt = 0;
let inFlight: Promise<void> | null = null;

/* Old enough to read again when somebody comes back to the tab, and how often
   to read again while they sit on it. */
const STALE_ON_RETURN_MS = 2 * 60 * 1000;
const WHILE_OPEN_MS = 5 * 60 * 1000;

function load(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = read().finally(() => {
    loadedAt = Date.now();
    inFlight = null;
  });
  return inFlight;
}

function read(): Promise<void> {
  return fetch("/api/diary", { cache: "no-store" })
    .then((r) => r.json())
    .then((j) => {
      if (j.ok && j.live && Array.isArray(j.appts)) {
        // Live book — the server has already merged our own appointments in.
        set({ appts: j.appts, live: true, loading: false, agents: j.agents ?? [], everything: Boolean(j.everything), error: null });
      } else if (j.ok && Array.isArray(j.mine)) {
        /* No REX on this environment. Appointments made HERE are real and
           still show; nothing stands in for the rest. */
        set({
          appts: [...(j.mine as Appt[])].sort((a, b) => a.day - b.day || a.start.localeCompare(b.start)),
          live: false,
          loading: false,
          agents: state.agents,
          everything: Boolean(j.everything),
          error: j.reason ?? "REX isn't connected on this environment.",
        });
      } else {
        set({ ...state, loading: false, error: j.error ?? j.reason ?? "REX didn't answer." });
      }
    })
    .catch(() => set({ ...state, loading: false, error: "REX didn't answer." }));
}

function start() {
  if (started) return;
  started = true;
  void load();

  /* KEPT FRESH (18 Sep 2026). This read once per tab and never again, and an
     appointment's `day` is an offset from the day it was READ. The OS is an
     installed app and tabs stay open: on Tuesday morning a tab opened on Monday
     showed Monday's diary under "Today" and drew Tuesday's viewings on
     Wednesday, so the booker offered taken slots as free. Anything put in the
     diary elsewhere during the day never arrived at all. Now: read again when
     somebody comes back to the tab, and every few minutes while it is open. */
  const back = () => {
    if (document.visibilityState === "visible" && Date.now() - loadedAt > STALE_ON_RETURN_MS) void load();
  };
  document.addEventListener("visibilitychange", back);
  window.addEventListener("focus", back);
  window.setInterval(() => {
    if (document.visibilityState === "visible" && Date.now() - loadedAt > WHILE_OPEN_MS) void load();
  }, 60 * 1000);
}

/**
 * Re-read the diary now.
 *
 * The store fetched once and never again, which was fine when it only
 * mirrored REX. It isn't once the OS can WRITE to the diary: booking a
 * travel buffer and then looking at the week you just changed has to show
 * the change, and nothing short of a page reload used to.
 */
export function refreshDiary(): Promise<void> {
  started = true;
  return load();
}

/** The diary, live where possible. Safe to call from any client component. */
export function useDiary(): DiaryState {
  if (typeof window !== "undefined") start();
  const snap = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    // The server render always sees the sample book, so markup matches on
    // hydration and the swap happens as a normal update afterwards.
    () => INITIAL
  );
  /* Holds the surrounding tile until the diary answers - see lib/reveal. */
  useReportReady(!snap.loading);
  return snap;
}

/**
 * MY day, whoever I am.
 *
 * An agent's diary is already only theirs. An owner's is the whole team's -
 * the Viewings screen and the booker need that - and until 21 Sep 2026 the
 * dashboard's tiles read it as it came, so James's "today" was everybody's.
 * The server marks which entries are the signed-in person's (`own`), because
 * only it knows the REX login they are filed under; this keeps those.
 *
 * For the dashboard and anything else that means "mine". A screen with a
 * person picker wants useDiary.
 */
export function useMyDiary(): DiaryState {
  const d = useDiary();
  if (!d.everything) return d;
  const appts = d.appts.filter((a) => a.own);
  return { ...d, appts, agents: [...new Set(appts.map((a) => a.agent).filter(Boolean))] };
}

