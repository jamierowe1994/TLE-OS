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

function load(): Promise<void> {
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
