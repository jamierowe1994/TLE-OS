/**
 * The London clock, read on a server that is not in London.
 *
 * Production runs in UTC. `getHours()` and `getDate()` there answer in UTC, and
 * from the last Sunday of March to the last Sunday of October that is an hour
 * behind the office. The diary read its times that way (found 18 Sep 2026,
 * proved against the stored viewings: the summer's first slot is 08:00Z and the
 * winter's is 09:00Z), so every appointment showed an hour early, anything
 * between midnight and 1am landed on the day before, and an all-day entry -
 * 23:00Z the night before - failed the midnight test and drew as a late block
 * on the wrong day.
 *
 * Everything here goes through Intl with an explicit zone, so it gives the same
 * answer on Railway, on a laptop and in a browser.
 */

const PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export interface LondonParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
}

export function londonParts(at: Date | string | number): LondonParts {
  const out: Record<string, number> = {};
  for (const p of PARTS.formatToParts(new Date(at))) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return { year: out.year, month: out.month, day: out.day, hour: out.hour, minute: out.minute };
}

/** "09:30", on the London clock. */
export function londonHHMM(at: Date | string | number): string {
  const p = londonParts(at);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

/** Whole London calendar days from `now` to `at`: 0 today, 1 tomorrow, -1
 *  yesterday. Counted on dates, not on milliseconds, so the 23- and 25-hour
 *  days when the clocks change do not shift a column. */
export function londonDayOffset(at: Date | string | number, now: Date | string | number = new Date()): number {
  const a = londonParts(at);
  const b = londonParts(now);
  return Math.round((Date.UTC(a.year, a.month - 1, a.day) - Date.UTC(b.year, b.month - 1, b.day)) / 86400000);
}

/** Midnight exactly, London time. */
export function isLondonMidnight(at: Date | string | number): boolean {
  const p = londonParts(at);
  return p.hour === 0 && p.minute === 0;
}
