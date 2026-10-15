/** Dates as YYYY-MM-DD that are on the calendar - pure, client-safe. */

export const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** A day that is on the calendar: the shape, and not 29 February 2025 or 31 April. */
export const REAL_DAY = (v: string) => {
  if (!YMD.test(v)) return false;
  const t = Date.parse(`${v}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === v;
};

/** 2025-02-29 → "29 February 2025", for saying which date is wrong. */
export const sayDay = (v: string) => {
  const [y, m, d] = v.split("-").map(Number);
  const month = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][m - 1];
  return month ? `${d} ${month} ${y}` : v;
};

/**
 * A date the reader worked out that falls off the end of its month (7 Oct
 * 2026: a gas check done on 29 February 2024 plus a year gave "2025-02-29",
 * Postgres refused it and Josel's filing failed with a bare 500) is brought
 * back to the month's last day - the earlier, safer date. Anything else that
 * is not a date is dropped, for the person to type.
 */
export function realDayOrNull(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!YMD.test(s)) return null;
  if (REAL_DAY(s)) return s;
  const [y, m, d] = s.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}
