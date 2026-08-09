"use client";

import { useSyncExternalStore } from "react";
import { DIARY, type Appt } from "@/lib/diary";

/**
 * One live copy of the diary, shared by every screen that shows it.
 *
 * Eight components read the diary — the week grid, the calendar, the booker,
 * the viewings page, the dashboard widget, the listing drawer. Threading
 * fetched data through all of them would mean a provider and eight prop
 * chains; instead there is one tiny store they all subscribe to.
 *
 * It starts as the sample book, so nothing ever renders empty, and swaps
 * itself for the real one the moment REX answers. `live` says which you have.
 */

interface DiaryState {
  appts: Appt[];
  live: boolean;
  loading: boolean;
  agents: string[];
}

/** The server (and first client) snapshot must be the SAME object every
 *  time it's read — returning a fresh literal makes React re-render forever
 *  looking for a stable value. */
const INITIAL: DiaryState = { appts: DIARY, live: false, loading: true, agents: [] };

let state: DiaryState = INITIAL;
const listeners = new Set<() => void>();
let started = false;

function set(next: DiaryState) {
  state = next;
  listeners.forEach((l) => l());
}

function start() {
  if (started) return;
  started = true;
  fetch("/api/diary")
    .then((r) => r.json())
    .then((j) => {
      if (j.ok && j.live && Array.isArray(j.appts)) {
        set({ appts: j.appts, live: true, loading: false, agents: j.agents ?? [] });
      } else {
        set({ ...state, loading: false });
      }
    })
    .catch(() => set({ ...state, loading: false }));
}

/** The diary, live where possible. Safe to call from any client component. */
export function useDiary(): DiaryState {
  if (typeof window !== "undefined") start();
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    // The server render always sees the sample book, so markup matches on
    // hydration and the swap happens as a normal update afterwards.
    () => INITIAL
  );
}
