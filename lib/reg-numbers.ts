/**
 * A Scottish landlord registration number is per person, so a home owned by
 * two people carries two (Lianna Denholm, 28 Oct 2026: "What if they have two
 * separate ones?"). They are kept as one value, separated by commas, so every
 * reader that wanted one number still has a string; these split and join it.
 */

/** The most a home is given room for: joint owners, rarely more than two. */
export const MAX_REG_NUMBERS = 4;

/**
 * Each number once, in the order given (1 Nov 2026: listing 855923 held
 * "186196/290/23410, 186196/290/23410"). The same number typed with other
 * spacing or case is the same number.
 */
function once(list: string[]): string[] {
  const seen = new Set<string>();
  return list
    .map((x) => x.replace(/\s+/g, " ").trim())
    .filter((x) => {
      const k = x.replace(/\s+/g, "").toUpperCase();
      if (!x || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

/** "123/230/1, 456/230/2" -> ["123/230/1", "456/230/2"]. A number kept twice reads once. */
export function regNumbers(value: string | null | undefined): string[] {
  return once((value ?? "").split(/[,;\n]+/));
}

/** The numbers as they are kept and written on the advert, each once. */
export function joinRegNumbers(list: string[]): string | null {
  const kept = once(list);
  return kept.length ? kept.join(", ") : null;
}

/** "123/230/1" or "123/230/1 and 456/230/2", for a sentence. */
export function regNumbersInWords(value: string | null | undefined): string {
  const list = regNumbers(value);
  return list.length > 1 ? `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}` : list[0] ?? "";
}

/* ── When each registration runs out ──────────────────────────────────────
   A Scottish registration lasts three years and must be renewed before it
   lapses (Lianna Denholm, 30 Oct 2026: "add LL reg expiry date to LL screen on
   the listing which will then pull through to compliance"). Kept beside the
   numbers on the home's record as "123/230/1: 2027-03-12, 456/230/2: 2028-01-04",
   so it reads plainly there too. One bare date, typed on the record by hand,
   counts for every number. */

/** A registration renews well inside two months of running out. */
export const REG_DUE_SOON_DAYS = 60;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar day, YYYY-MM-DD. */
export function isRealDay(v: unknown): boolean {
  if (typeof v !== "string" || !ISO_DAY.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** The kept value -> { number: day }, for the numbers given. */
export function regExpiries(value: string | null | undefined, numbers: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  const text = (value ?? "").trim();
  if (!text) return out;
  if (isRealDay(text)) {
    for (const n of numbers) out[n] = text;
    return out;
  }
  for (const part of text.split(/[,;\n]+/)) {
    const m = part.match(/^\s*(.+?)\s*:\s*(\d{4}-\d{2}-\d{2})\s*$/);
    if (!m || !isRealDay(m[2])) continue;
    const num = m[1].replace(/\s+/g, " ").trim();
    if (numbers.includes(num)) out[num] = m[2];
  }
  return out;
}

/** { number: day } -> the kept value, in the numbers' own order. */
export function joinRegExpiries(map: Record<string, string | null | undefined>, numbers: string[]): string | null {
  const kept = numbers.filter((n) => isRealDay(map[n])).map((n) => `${n}: ${map[n]}`);
  return kept.length ? kept.join(", ") : null;
}

export type RegState = "expired" | "due-soon" | "valid" | "no-date";

/** How one registration stands today. */
export function regState(day: string | null | undefined, today = new Date()): RegState {
  if (!isRealDay(day)) return "no-date";
  const days = Math.floor((new Date(`${day}T00:00:00Z`).getTime() - Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) / 86_400_000);
  return days < 0 ? "expired" : days <= REG_DUE_SOON_DAYS ? "due-soon" : "valid";
}

/** "12 Mar 2027". */
export function regDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
