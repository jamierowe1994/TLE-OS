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

/* ── Whose number is whose ────────────────────────────────────────────────
   Joint owners each register, so a number is labelled with its landlord's
   name (Lianna Denholm, 2 Nov 2026: "No place to add LL reg expiry date on
   2nd LL" - the box listed bare numbers and never named the second landlord).
   Kept beside the numbers on the home's record as "123/230/1: Maureen Hood". */

/** A name as it can be kept between the commas and colons. */
export function regOwnerName(v: unknown): string {
  return typeof v === "string" ? v.replace(/[,:;\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) : "";
}

/** The kept value -> { number: name }, for the numbers given. */
export function regOwners(value: string | null | undefined, numbers: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (value ?? "").split(/[,;\n]+/)) {
    const m = part.match(/^\s*(.+?)\s*:\s*(.+?)\s*$/);
    if (!m) continue;
    const num = m[1].replace(/\s+/g, " ").trim();
    if (numbers.includes(num) && m[2]) out[num] = m[2];
  }
  return out;
}

/** { number: name } -> the kept value, in the numbers' own order. */
export function joinRegOwners(map: Record<string, string | null | undefined>, numbers: string[]): string | null {
  const kept = numbers.filter((n) => regOwnerName(map[n])).map((n) => `${n}: ${regOwnerName(map[n])}`);
  return kept.length ? kept.join(", ") : null;
}

/**
 * Each number with the landlord it belongs to: the name kept with it, else -
 * for a number typed before names were kept - the next landlord on the home
 * still without one, the main landlord first. Then every landlord with no
 * number at all, so the screen can ask for theirs.
 */
export function regByLandlord(
  numbers: string[],
  owners: Record<string, string>,
  landlords: string[]
): { rows: { n: string; owner: string | null }[]; missing: string[] } {
  const key = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  const named = new Set(Object.values(owners).map(key));
  const free = landlords.filter((l) => !named.has(key(l)));
  const rows = numbers.map((n) => ({ n, owner: owners[n] ?? free.shift() ?? null }));
  const covered = new Set(rows.map((r) => (r.owner ? key(r.owner) : "")));
  return { rows, missing: landlords.filter((l) => !covered.has(key(l))) };
}

/* ── Into the terms, and back from them ───────────────────────────────────
   Lianna Denholm, 4 Nov 2026: the Scottish terms ask each landlord for their
   registration number and its expiry, and they always opened blank - a
   second landlord typed a shortened number over the one the listing held. Each landlord now starts from the number on file that is
   theirs (regByLandlord: named, else the next landlord without one, the main
   landlord first), and what they give when they sign goes back on file. */

export type HomeReg = { numbers: string[]; expiry: Record<string, string>; owners: Record<string, string> };

/** Each landlord's own number and its expiry ("" when none), in the order given; null for a landlord with none on file. */
export function regForLandlords(reg: HomeReg | null | undefined, landlords: string[]): Array<{ number: string; expiry: string } | null> {
  if (!reg?.numbers.length) return landlords.map(() => null);
  const key = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  const { rows } = regByLandlord(reg.numbers, reg.owners ?? {}, landlords.filter((l) => l.trim()));
  return landlords.map((l) => {
    const row = l.trim() ? rows.find((r) => r.owner && key(r.owner) === key(l)) : undefined;
    return row ? { number: row.n, expiry: isRealDay(reg.expiry?.[row.n]) ? reg.expiry[row.n] : "" } : null;
  });
}

/**
 * One landlord's registration as they gave it when they signed, laid over what
 * the home holds. It only fills what is blank or changes that landlord's own
 * entry: a number on file already named as another landlord's is never
 * touched, a number nobody is named against becomes theirs, and a new number
 * replaces the one named as theirs, else is added. Null when nothing changes.
 */
export function withLandlordReg(held: HomeReg, landlord: string, number: string, day: string | null): HomeReg | null {
  const key = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  const flat = (s: string) => s.replace(/\s+/g, "").toUpperCase();
  const me = key(landlord);
  const n = number.replace(/\s+/g, " ").trim();
  const d = isRealDay(day) ? (day as string) : null;
  if (!me || !n) return null;
  const numbers = [...held.numbers];
  const expiry = { ...held.expiry };
  const owners = { ...held.owners };
  const at = numbers.findIndex((x) => flat(x) === flat(n));
  if (at >= 0) {
    const x = numbers[at];
    const owner = owners[x];
    if (owner && key(owner) !== me) return null;
    let changed = false;
    if (!owner) {
      owners[x] = regOwnerName(landlord);
      changed = true;
    }
    /* Their own entry's date is theirs to change; on one nobody was named against, only a blank is filled. */
    if (d && expiry[x] !== d && (owner || !expiry[x])) {
      expiry[x] = d;
      changed = true;
    }
    return changed ? { numbers, expiry, owners } : null;
  }
  const mine = numbers.findIndex((x) => owners[x] && key(owners[x]) === me);
  if (mine >= 0) {
    const old = numbers[mine];
    numbers[mine] = n;
    delete expiry[old];
    delete owners[old];
  } else if (numbers.length >= MAX_REG_NUMBERS) {
    return null;
  } else {
    numbers.push(n);
  }
  owners[n] = regOwnerName(landlord);
  if (d) expiry[n] = d;
  return { numbers, expiry, owners };
}
