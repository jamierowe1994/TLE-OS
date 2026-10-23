"use client";

import { useEffect, useState } from "react";
import { ALL_OFF, type LookOn, type LookScreen } from "@/lib/new-look";

/**
 * Whether this screen is in the new look for whoever is signed in.
 *
 * Asked once per page load and shared by every caller, with the last answer
 * kept in this browser so a reload paints the right look first time instead
 * of flashing the old screen. With no answer yet and nothing kept, it is null:
 * the caller shows its own loading state rather than guessing.
 *
 * `?look=new` or `?look=old` in the address pins it either way on this browser,
 * so a screen can be compared side by side; `?look=auto` lets the switch decide
 * again. It changes what this browser draws, nothing else.
 */

const KEEP = "os-new-look-v1";
const FORCE = "os-new-look-force";

let answer: LookOn | null = null;
let asking: Promise<LookOn> | null = null;
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
  asking ??= fetch("/api/new-look", { cache: "no-store" })
    .then((r) => r.json())
    .then((j: { on?: Partial<LookOn> }) => ({ ...ALL_OFF, ...(j.on ?? {}) }))
    .catch(() => kept() ?? { ...ALL_OFF })
    .then((on) => {
      answer = on;
      try {
        window.localStorage.setItem(KEEP, JSON.stringify(on));
      } catch {
        /* fine - next load asks again */
      }
      listeners.forEach((l) => l(on));
      return on;
    });
  return asking;
}

export function useNewLook(screen: LookScreen): boolean | null {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    const f = forced();
    if (f) {
      setOn(f === "new");
      return;
    }
    const start = answer ?? kept();
    if (start) setOn(start[screen]);
    const l = (a: LookOn) => setOn(a[screen]);
    listeners.add(l);
    if (!answer) void ask();
    return () => {
      listeners.delete(l);
    };
  }, [screen]);
  return on;
}
