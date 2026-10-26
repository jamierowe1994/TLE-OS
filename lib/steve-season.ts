/**
 * Seasonal Steves (James, 26 Oct 2026: "I think it'd be funny if we could do
 * seasonal Steves"). Which costume, if any, he wears today - read on the
 * UK calendar, so it turns on and off at midnight in the office, not at
 * midnight wherever the browser happens to be.
 *
 * Halloween: the week of it, Monday 26 to Saturday 31 October; back to
 * normal on the Sunday. Every year on the same dates (26-31 October).
 * Add a season here and draw it in components/SteveOrb.tsx.
 */

export type SteveSeason = "halloween" | null;

export function steveSeason(now = new Date()): SteveSeason {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", month: "numeric", day: "numeric" }).formatToParts(now);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  if (month === 10 && day >= 26 && day <= 31) return "halloween";
  return null;
}
