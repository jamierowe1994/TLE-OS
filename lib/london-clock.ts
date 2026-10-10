/**
 * Wall-clock times on the London clock, for the booking pop-ups (8 Oct 2026):
 * an agent types "12:00" meaning 12:00 in the UK, whatever the browser's or
 * the server's zone, and BST or GMT. Client-safe; no imports.
 */

/** "12:05" on the London clock. */
export const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

/** "2026-10-09", the London day. */
export const londonDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/London" });

/** "Friday 9 October". */
export const dayWords = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" });

export const plus = (iso: string, mins: number) => new Date(new Date(iso).getTime() + mins * 60_000).toISOString();

/** A London day ("YYYY-MM-DD") and a typed "HH:MM" as an instant, or null. */
export function atLondon(day: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{1,2}:\d{2}$/.test(time)) return null;
  const [h, m] = time.split(":").map(Number);
  const want = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  /* The London clock is UTC or UTC+1: try both, keep the one that reads right. */
  for (const offset of [0, -60, 60]) {
    const iso = new Date(new Date(`${day}T${want}:00Z`).getTime() + offset * 60_000).toISOString();
    if (londonDay(iso) === day && hhmm(iso) === want) return iso;
  }
  return null;
}

/** "1 hr 15 min". */
export function lengthWords(n: number): string {
  const h = Math.floor(n / 60);
  const m = n % 60;
  if (!h) return `${m} min`;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

/**
 * Today and this month on the London clock (Rig run 2, P-020, 10 Oct 2026).
 * `new Date().toISOString().slice(...)` is UTC: Railway runs on UTC, so
 * between midnight and 1am in summer "today" was yesterday and, on the 1st,
 * "this month" was last month.
 */
export const londonToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
export const londonMonth = () => londonToday().slice(0, 7);
