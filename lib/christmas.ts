"use client";

import { useCallback, useEffect, useState } from "react";
import { useNewLook } from "@/lib/use-new-look";
import { usePref } from "@/lib/prefs-store";

/**
 * THE CHRISTMAS LOOK (James, 26 Nov 2026): "give Steve a Christmas hat ...
 * some snow falling and some bunting up on the homepage, and maybe a few other
 * things scattered around ... lock it behind one of the switches so I can
 * switch it on on the 1st of December ... a little tile that says Try the new
 * Christmas look. When they've got the Christmas look on, they can switch it
 * off if they don't like it."
 *
 * Two layers:
 *   - the SEASON: the "christmas" switch (Admin > Switches > The New Look) is
 *     on for this person AND it is between 1 November and 6 January on the UK
 *     calendar. Steve's hat and the sidebar tile follow the season alone.
 *     November is in the window so James can see it on Only me before the 1st;
 *     6 January (Twelfth Night) is the last day, so nobody has to remember to
 *     take the decorations down.
 *   - the LOOK: what a person chose with the tile (snow, bunting, holly,
 *     fairy lights). Off until they press it; kept in their prefs, so it
 *     follows them to another computer.
 */

const PREF = "christmas-look";

export function inChristmasWindow(now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", month: "numeric", day: "numeric" }).formatToParts(now);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  return month === 11 || month === 12 || (month === 1 && day <= 6);
}

/** Steve's hat and the tile: the switch, inside the window. Read in the browser only. */
export function useChristmasSeason(): boolean {
  const on = useNewLook("christmas") === true;
  const [inWindow, setInWindow] = useState(false);
  useEffect(() => setInWindow(inChristmasWindow()), []);
  return on && inWindow;
}

/** The person's own choice, inside the season. */
export function useChristmas(): { season: boolean; on: boolean; set: (v: boolean) => void } {
  const season = useChristmasSeason();
  const [stored, store] = usePref<boolean>(PREF, false);
  /* usePref keeps a copy per caller, so the tile tells the snow, the holly and
     the lights itself: one event, every copy follows at once. */
  const [now, setNow] = useState<boolean | null>(null);
  useEffect(() => {
    const l = (e: Event) => setNow((e as CustomEvent<boolean>).detail === true);
    window.addEventListener(EVENT, l);
    return () => window.removeEventListener(EVENT, l);
  }, []);
  const chosen = now ?? stored;
  const set = useCallback(
    (v: boolean) => {
      store(v);
      window.dispatchEvent(new CustomEvent<boolean>(EVENT, { detail: v }));
    },
    [store]
  );
  return { season, on: season && chosen === true, set };
}

const EVENT = "os-christmas-look";

/** Nobody who has asked their computer for less motion gets falling snow or twinkling. */
export function useStill(): boolean {
  const [still, setStill] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setStill(m.matches);
    const l = () => setStill(m.matches);
    m.addEventListener("change", l);
    return () => m.removeEventListener("change", l);
  }, []);
  return still;
}
