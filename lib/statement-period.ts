/**
 * The periods a commission statement can cover (agents' call, 19 Oct 2026:
 * "download a statement for any period, a full year included", instead of
 * waiting on PayProp's monthly ones, which some never receive).
 *
 * Pure and client-safe: the Finances screen and the statement route resolve
 * a period with the same code, so the dates on the screen are the dates in
 * the PDF.
 *
 * Everything reads the London clock and rolls over on its own. No month or
 * year is written down anywhere in here.
 */

export type PeriodKind = "this-month" | "last-month" | "tax-year" | "calendar-year" | "custom";

export const PERIOD_CHOICES: { kind: PeriodKind; label: string }[] = [
  { kind: "this-month", label: "This month" },
  { kind: "last-month", label: "Last month" },
  { kind: "tax-year", label: "Tax year" },
  { kind: "calendar-year", label: "Calendar year" },
  { kind: "custom", label: "Custom" },
];

/**
 * The first day PayProp answers for. Measured 28 Aug 2026 (MONEY_FLOOR in
 * lib/business/gci-history): every month from August 2025 is there, nothing
 * before it ever came back. A statement starting earlier would be half
 * empty, so it is refused rather than drawn.
 */
export const STATEMENT_FLOOR = "2025-08-01";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export const londonTodayIso = (now = new Date()) => now.toLocaleDateString("en-CA", { timeZone: "Europe/London" });

const lastDayOf = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const pad = (n: number) => String(n).padStart(2, "0");

export interface Period {
  kind: PeriodKind;
  /** First day, inclusive, YYYY-MM-DD. */
  from: string;
  /** Last day, inclusive, never past today. */
  to: string;
  /** The period as named, for the heading: "Tax Year 2026/27". */
  title: string;
  /** True when the period has not finished yet, so the PDF says "to date". */
  toDate: boolean;
}

/**
 * Resolve a choice into dates. Null with a reason when the dates make no
 * sense or reach back before PayProp's history.
 */
export function resolvePeriod(
  kind: PeriodKind,
  custom: { from?: string | null; to?: string | null } = {},
  now = new Date(),
): { ok: true; period: Period } | { ok: false; error: string } {
  const today = londonTodayIso(now);
  const [y, m] = today.split("-").map(Number);
  let from: string;
  let end: string;
  let title: string;

  if (kind === "this-month") {
    from = `${y}-${pad(m)}-01`;
    end = `${y}-${pad(m)}-${pad(lastDayOf(y, m))}`;
    title = monthWords(from);
  } else if (kind === "last-month") {
    const ly = m === 1 ? y - 1 : y;
    const lm = m === 1 ? 12 : m - 1;
    from = `${ly}-${pad(lm)}-01`;
    end = `${ly}-${pad(lm)}-${pad(lastDayOf(ly, lm))}`;
    title = monthWords(from);
  } else if (kind === "tax-year") {
    /* The UK tax year runs 6 April to 5 April. */
    const startYear = today >= `${y}-04-06` ? y : y - 1;
    from = `${startYear}-04-06`;
    end = `${startYear + 1}-04-05`;
    title = `Tax Year ${startYear}/${String(startYear + 1).slice(2)}`;
  } else if (kind === "calendar-year") {
    from = `${y}-01-01`;
    end = `${y}-12-31`;
    title = `Calendar Year ${y}`;
  } else {
    const f = (custom.from ?? "").trim();
    const t = (custom.to ?? "").trim();
    if (!ISO_DAY.test(f) || !ISO_DAY.test(t)) return { ok: false, error: "Pick a start and an end date." };
    if (t < f) return { ok: false, error: "The end date is before the start date." };
    from = f;
    end = t;
    title = `${dayWords(f)} to ${dayWords(t)}`;
  }

  if (from > today) return { ok: false, error: "That period hasn't started yet." };
  if (from < STATEMENT_FLOOR) {
    return {
      ok: false,
      error: `PayProp's history here starts on ${dayWords(STATEMENT_FLOOR)}, so a statement can't begin before then.`,
    };
  }
  const to = end > today ? today : end;
  return { ok: true, period: { kind, from, to, title, toDate: end > today } };
}

/** "6 April 2026". */
export function dayWords(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** "6 Apr 2026", for table rows. */
export function dayShort(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** "October 2026" from any day in it. */
export function monthWords(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** The period as query parameters, the one spelling the screen, the route and the PDF link share. */
export function periodQuery(kind: PeriodKind, custom: { from?: string; to?: string }, agentId?: string | null): string {
  const qs = new URLSearchParams({ period: kind });
  if (kind === "custom") {
    if (custom.from) qs.set("from", custom.from);
    if (custom.to) qs.set("to", custom.to);
  }
  if (agentId) qs.set("agent", agentId);
  return qs.toString();
}

export function isPeriodKind(v: string | null): v is PeriodKind {
  return PERIOD_CHOICES.some((c) => c.kind === v);
}
