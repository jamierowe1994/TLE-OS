"use client";

import { useEffect, useState } from "react";
import type { Appt } from "@/lib/diary";
import { endOf, loadDiary, nowHm } from "./diary-bits";

/**
 * Home's four figures (3 Oct 2026), each the signed-in agent's own and read
 * live from the same routes the desktop dashboard's tiles use - nothing new
 * counts anything, so the phone and the desk can never disagree:
 *
 *   Leads today   /api/leads            receivedAt on today's LONDON date
 *   On market     /api/listings         counts.available (current, not let agreed)
 *   Applications  /api/applications     received or communicated, and not closed
 *   Viewings      /api/diary            viewings in the next seven days
 *
 * A figure that cannot be read honestly is null, and the tile shows a dash -
 * never a zero it does not know, and never the sample book. A route that
 * answers "stale" is asked again a few seconds later, as the desk does.
 */

export type Figure = number | null | "loading";

export interface HomeFigures {
  leadsToday: Figure;
  onMarket: Figure;
  applications: Figure;
  viewingsWeek: Figure;
  /** Today's diary, for the Today card: what is still to come, by kind. */
  today: Appt[] | null;
  todayError: boolean;
}

const londonDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(d);

type Json = Record<string, unknown>;

async function read(url: string, again = true): Promise<Json | null> {
  const r = await fetch(url, { cache: "no-store" }).catch(() => null);
  if (!r) return null;
  const j = (await r.json().catch(() => null)) as Json | null;
  if (!r.ok || !j) return null;
  if (j.stale && again) {
    await new Promise((res) => setTimeout(res, 4000));
    return (await read(url, false)) ?? j;
  }
  return j;
}

export function useHomeFigures(): HomeFigures {
  const [f, setF] = useState<HomeFigures>({ leadsToday: "loading", onMarket: "loading", applications: "loading", viewingsWeek: "loading", today: null, todayError: false });

  useEffect(() => {
    let dead = false;
    const set = (patch: Partial<HomeFigures>) => !dead && setF((x) => ({ ...x, ...patch }));

    void read("/api/leads").then((j) => {
      if (!j || j.demo || j.unlinked || !Array.isArray(j.leads)) return set({ leadsToday: null });
      const today = londonDay(new Date());
      const n = (j.leads as Array<{ receivedAt?: string }>).filter((l) => l.receivedAt && londonDay(new Date(l.receivedAt)) === today).length;
      set({ leadsToday: n });
    });

    void read("/api/listings?tests=0").then((j) => {
      const counts = j?.counts as { available?: number } | undefined;
      if (!j || !j.live || j.unlinked || typeof counts?.available !== "number") return set({ onMarket: null });
      set({ onMarket: counts.available });
    });

    void read("/api/applications?limit=300&tests=0").then((j) => {
      if (!j || j.error || j.unlinked || !Array.isArray(j.applications)) return set({ applications: null });
      const open = (j.applications as Array<{ status?: string; closed?: string | null }>).filter(
        (a) => (a.status === "received" || a.status === "communicated") && !a.closed
      ).length;
      set({ applications: open });
    });

    loadDiary()
      .then(({ appts, note }) => {
        const real = appts.filter((a) => !a.allDay && a.kind !== "travel" && !(a.what === "Busy" && !a.where));
        /* Only OS-made appointments when the full diary is not connected: the
           week's viewings would be a guess, so the tile says so with a dash. */
        set({
          viewingsWeek: note ? null : real.filter((a) => a.kind === "viewing" && a.day >= 0 && a.day <= 6).length,
          today: real.filter((a) => a.day === 0).sort((a, b) => a.start.localeCompare(b.start)),
        });
      })
      .catch(() => set({ viewingsWeek: null, todayError: true }));

    return () => {
      dead = true;
    };
  }, []);

  return f;
}

/** "2 viewings · 1 move-in" for what is still to come today. */
export function todayLine(today: Appt[]): string {
  const now = nowHm();
  const left = today.filter((a) => endOf(a) > now);
  if (!left.length) return today.length ? "That's everything for today" : "Nothing booked today";
  const words: Record<string, [string, string]> = {
    viewing: ["viewing", "viewings"],
    appraisal: ["market appraisal", "market appraisals"],
    takeon: ["take-on visit", "take-on visits"],
    movein: ["move-in", "move-ins"],
    inspection: ["inspection", "inspections"],
  };
  const counts = new Map<string, number>();
  for (const a of left) counts.set(a.kind, (counts.get(a.kind) ?? 0) + 1);
  return [...counts.entries()]
    .map(([k, n]) => {
      const w = words[k] ?? ["appointment", "appointments"];
      return `${n} ${n === 1 ? w[0] : w[1]}`;
    })
    .join(" · ");
}
