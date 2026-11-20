import { currentMonth, monthLabel } from "@/lib/business/format";

/**
 * Periods longer than a month for the Agents tab: each calendar quarter of
 * this year that has started, and the year to date (Susan Liles, 20 Nov 2026,
 * ticket 8ea5a7b8: "a filter to see the agents income / GCI per period i.e
 * quarter, 2026 to date").
 *
 * EVERYTHING HERE IS WORKED OUT FROM `today`, which defaults to the London
 * clock's month. No year or month is typed anywhere: on 1 January the list
 * becomes "Q1 <new year> to date" and "<new year> to date" by itself, and the
 * quarter we are in gains its "to date" as it starts. Hardcoded month literals
 * are this dashboard's most repeated fault; see the July notes in agents.tsx.
 *
 * Plain functions with no server imports, so the frame (to list the choices)
 * and /api/business/agent-period (to turn a choice back into months) share one
 * definition and cannot disagree about what "Q3" holds.
 */

export interface AgentPeriod {
  /** "2026-q3" or "2026-ytd" - the year is part of the key, never assumed. */
  key: string;
  /** "Q3 2026", "Q4 2026 to date", "2026 to date". */
  label: string;
  /** Every month in it up to and including `today`, oldest first. */
  months: string[];
  /** True when the month we are standing in is one of them. */
  live: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The periods on offer as at `today` (YYYY-MM): quarters oldest first, then the year. */
export function periodsFor(today: string = currentMonth()): AgentPeriod[] {
  const year = Number(today.slice(0, 4));
  const mon = Number(today.slice(5, 7));
  if (!Number.isFinite(year) || !(mon >= 1 && mon <= 12)) return [];
  const upTo = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `${year}-${pad(from + i)}`);
  const thisQuarter = Math.ceil(mon / 3);
  const quarters: AgentPeriod[] = [];
  for (let q = 1; q <= thisQuarter; q++) {
    const first = (q - 1) * 3 + 1;
    const live = q === thisQuarter;
    quarters.push({
      key: `${year}-q${q}`,
      label: live ? `Q${q} ${year} to date` : `Q${q} ${year}`,
      months: upTo(first, live ? mon : first + 2),
      live,
    });
  }
  return [
    ...quarters,
    { key: `${year}-ytd`, label: `${year} to date`, months: upTo(1, mon), live: true },
  ];
}

/** The period a key names, as at `today` - null for a key that isn't on offer
 *  (a quarter not yet started, a year other than this one, or nonsense). */
export function periodByKey(key: string, today: string = currentMonth()): AgentPeriod | null {
  return periodsFor(today).find((p) => p.key === key) ?? null;
}

/** "July to September 2026", "November 2026" - the months a period covers, in words. */
export function periodSpan(p: Pick<AgentPeriod, "months">): string {
  const first = p.months[0];
  const last = p.months[p.months.length - 1];
  if (!first || !last) return "";
  if (first === last) return monthLabel(first);
  const name = (m: string) => monthLabel(m).replace(/\s+\d{4}$/, "");
  return first.slice(0, 4) === last.slice(0, 4)
    ? `${name(first)} to ${monthLabel(last)}`
    : `${monthLabel(first)} to ${monthLabel(last)}`;
}
