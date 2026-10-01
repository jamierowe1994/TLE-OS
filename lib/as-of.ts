import { londonHHMM, londonDayOffset } from "@/lib/london-time";

/**
 * How old a screen's figures are, in words (1 Oct 2026).
 *
 * Compliance, the tracker and Portfolio serve cached figures - fresh for an
 * hour, and when a refresh fails, whatever was held, at any age. The routes
 * always said how old (ageMs, stale) and no screen read it: on 30 Sep the
 * compliance figures were 2.5 hours old and nothing on the page said so. The
 * house rule is that a figure is live or it says it isn't.
 *
 *   fresh   "as of 14:05"
 *   old     "as of 11:35 (2 hours ago - newer figures are on their way;
 *            refresh in a minute)"
 */
const OLD_MS = 60 * 60 * 1000;

export function asOf(ageMs: number | null | undefined, now: number = Date.now()): { text: string; old: boolean } {
  if (ageMs == null || !Number.isFinite(ageMs)) return { text: "", old: false };
  const at = now - Math.max(0, ageMs);
  const day = londonDayOffset(at, now);
  const when = `${londonHHMM(at)}${day === 0 ? "" : day === -1 ? " yesterday" : ` on ${new Date(at).toLocaleDateString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short" })}`}`;
  if (ageMs < OLD_MS) return { text: `as of ${when}`, old: false };
  const mins = Math.round(ageMs / 60000);
  const ago = mins < 120 ? `${mins} minutes ago` : mins < 48 * 60 ? `${Math.round(mins / 60)} hours ago` : `${Math.round(mins / 1440)} days ago`;
  return { text: `as of ${when} (${ago} - newer figures are on their way; refresh in a minute)`, old: true };
}
