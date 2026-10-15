import { londonParts, londonTime } from "@/lib/london-time";

/**
 * The periods Admin > Tracking can be read over (15 Oct 2026).
 *
 * Worked out from the clock every time, on London's calendar: there is no
 * month written down anywhere in here, so "This month" becomes November on
 * the 1st without anybody touching it. `now` is a parameter so the roll-over
 * can be checked against a date that has not happened yet.
 *
 *   week        Monday 00:00 London to now
 *   month       the 1st of this month to now
 *   last-month  the 1st of last month to the 1st of this one
 *   custom      the start of `from` to the end of `to`, both London dates
 *
 * `to` is always exclusive.
 */

export type PeriodKey = "week" | "month" | "last-month" | "custom";

export const PERIODS: Array<{ key: PeriodKey; label: string }> = [
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "last-month", label: "Last month" },
  { key: "custom", label: "Custom" },
];

export interface Period {
  key: PeriodKey;
  from: Date;
  to: Date;
  /** Said on screen: "This week", "October 2026", "1 Oct to 15 Oct 2026". */
  label: string;
}

const MONTH = (y: number, m: number) =>
  new Date(Date.UTC(y, m - 1, 15)).toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

const DAY = (d: Date, year = false) =>
  d.toLocaleString("en-GB", { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}), timeZone: "Europe/London" });

/** A "YYYY-MM-DD" London date, or null. */
function parseDay(s: string | null | undefined): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? "");
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, m: mo, d };
}

/** The London calendar date of an instant, as "YYYY-MM-DD". */
export function londonDate(at: Date | number | string): string {
  const p = londonParts(at);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function periodRange(key: PeriodKey, now: Date = new Date(), custom?: { from?: string | null; to?: string | null }): Period {
  const p = londonParts(now);
  if (key === "week") {
    /* Monday is day 1. The weekday of the London date, not the UTC one. */
    const dow = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
    const back = (dow + 6) % 7;
    const monday = new Date(Date.UTC(p.year, p.month - 1, p.day - back));
    const from = londonTime(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate(), 0);
    return { key, from, to: now, label: "This week" };
  }
  if (key === "month") {
    return { key, from: londonTime(p.year, p.month, 1, 0), to: now, label: MONTH(p.year, p.month) };
  }
  if (key === "last-month") {
    const y = p.month === 1 ? p.year - 1 : p.year;
    const m = p.month === 1 ? 12 : p.month - 1;
    return { key, from: londonTime(y, m, 1, 0), to: londonTime(p.year, p.month, 1, 0), label: MONTH(y, m) };
  }
  const a = parseDay(custom?.from);
  const b = parseDay(custom?.to);
  if (!a || !b) return periodRange("month", now);
  let from = londonTime(a.y, a.m, a.d, 0);
  /* The end of the `to` day: midnight at the start of the next one. */
  const next = new Date(Date.UTC(b.y, b.m - 1, b.d + 1));
  let to = londonTime(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 0);
  if (to < from) [from, to] = [to, from];
  if (to > now) to = now;
  return { key, from, to, label: `${DAY(from)} to ${DAY(new Date(to.getTime() - 1), true)}` };
}

/** The query string the screens send to the API for a period. */
export function periodQuery(p: Period): string {
  return `from=${encodeURIComponent(p.from.toISOString())}&to=${encodeURIComponent(p.to.toISOString())}`;
}
