"use client";

import { useSyncExternalStore } from "react";

/**
 * The guide sheet: one place, page-wide, that shows a guide as a pop-up.
 *
 * James, 16 Sep 2026: "as they click the guide, it will pop out onto the
 * screen, and they can see it." So a guide opens over whatever screen the
 * agent is on (from Steve's Guides tab, or a How this works button) rather
 * than taking them somewhere else and losing their place.
 *
 * Same shape as lib/doc-sheet: a tiny store, and components/GuideLayer in the
 * OS layout draws whatever is open.
 */

let current: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function openGuide(id: string) {
  current = id;
  emit();
}

export function closeGuide() {
  current = null;
  emit();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export function useOpenGuideId(): string | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}
