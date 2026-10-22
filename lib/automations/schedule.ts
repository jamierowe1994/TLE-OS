import "server-only";
import { nextRun, type Every } from "@/lib/steve-jobs";
import type { Params } from "@/lib/automations/catalogue";

/** The next slot for an "On a schedule" automation, on the London clock - the same walk Steve's standing jobs use. */
export function nextScheduled(p: Params, from = new Date()): Date | null {
  const every = (["day", "weekday", "week", "month"].includes(String(p.every)) ? String(p.every) : "week") as Every;
  const at = /^\d{1,2}:\d{2}$/.test(String(p.at ?? "")) ? String(p.at) : "09:00";
  const on = Number.isFinite(Number(p.on)) ? Number(p.on) : 1;
  return nextRun(every, on, at, from);
}
