import "server-only";
import { getComplianceBook } from "@/lib/compliance-cache";
import { rexCall, rexConfigured, rexRows } from "@/lib/rex";

/**
 * An address → the REX property it names.
 *
 * The same rules the certificate backlog ran on 6 Sep 2026 (535 Propoly
 * folders, 477 confident, none wrong on a two-dozen spot check), brought
 * into the OS so a market appraisal, an application or a dropped file can
 * find its property the same way. Strictest tier first; the full postcode
 * has to agree unless the tier says otherwise:
 *
 *   exact      same numbers, same unit, same descriptor words       → confident
 *   unit       "Flat 10, Cara House" is REX's "Flat 10, 48 Capitol
 *              Way" when it is the only flat 10 at that postcode     → confident
 *   shared     a room in a shared house: the house and every room    → confident
 *   building   the folder IS the building: every unit under it       → confident
 *   superset   REX's line carries more (a floor code) but agrees     → confident
 *   subset     the folder carries more than REX's line               → check
 *   postcode   outward half, street and numbers agree, inward differs → check
 *
 * Only "confident" is ever written to. "check" and "no match" go in front
 * of a person with the candidates.
 */

export interface MatchCandidate {
  id: string;
  name: string;
  locality: string;
}

export interface MatchResult {
  verdict: "confident" | "check" | "no match";
  how: string;
  targets: MatchCandidate[];
  possible: MatchCandidate[];
}

const POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;
const UNIT_WORDS = /^(flat|room|apartment|unit|apt|studio)$/;
const FILLER = /^(flat|room|apartment|unit|apt|studio|floor|the|ground|first|second|third|top|basement|lower|upper|gff|fff|house|rear|front)$/;
const DESCRIPTOR = /^(basement|ground|first|second|third|top|lower|upper|gff|fff|rear|front|garden|penthouse|annexe?)$/;
const STREET_SUFFIX = /^(road|street|avenue|lane|close|drive|way|place|terrace|gardens|court|crescent|square|grove|walk|park|hill|mews|row|green|view|rise|wynd|quay|parade|vale|gate|loan|brae)$/;

export function postcodeOf(s: string): string | null {
  const m = String(s).match(POSTCODE);
  return m ? `${m[1]} ${m[2]}`.toUpperCase() : null;
}

function norm(s: string): string {
  return String(s)
    .toLowerCase()
    .replace(new RegExp(POSTCODE.source, "gi"), " ")
    .replace(/\b(\d+[a-z]?)\s*\/\s*(\d+[a-z]?)\b/g, "$1f$2") // Glasgow "1/2" → one token
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(flat|apartment|apt|unit)\s+([a-z])\b[ ]+(\d+)\b/g, "$1 $3$2") // "flat b 17" → "flat 17b"
    .replace(/(^|\s)([a-z])\s+(\d+)\b(?!\s*[a-z]?\d)/g, "$1$3$2") // "b 41 milton" → "41b milton"
    .replace(/\b(\d+)\s+([a-z])\b(?!\s*\d)/g, "$1$2") // "18 b" → "18b"
    .replace(/\s+/g, " ")
    .trim();
}

const isNum = (w: string) => /\d/.test(w);

function streetIndex(words: string[]): number {
  for (let i = 1; i < words.length; i++) {
    if (STREET_SUFFIX.test(words[i]) && !isNum(words[i - 1]) && !FILLER.test(words[i - 1])) return i - 1;
  }
  return words.findIndex((w) => w.length > 3 && !isNum(w) && !FILLER.test(w));
}

interface Parsed {
  nums: Set<string>;
  building: string | null;
  unit: string | null;
  unitWord: "room" | "flat" | null;
  street: string;
  front: string;
  sig: Set<string>;
  ident: string;
}

/**
 * One address, taken apart: the numbers on it, which is the building (the
 * one before the street - "Flat 6, 222 Dogsthorpe Road" is building 222),
 * which is the unit (after flat/room/apartment; Scotland's "109-2 Moredun
 * Park Road" is 109, flat 2, and "3-1, 231 Meadowpark Street" is floor
 * code 3/1 at 231), and whether the unit is a room in a shared house.
 */
export function parseAddress(s: string): Parsed {
  let raw = String(s);
  const scot = raw.match(/^\s*(\d+[a-z]?)\s*[-/]\s*(\d+[a-z]?)\b/i);
  let scotBuilding: string | null = null;
  let scotUnit: string | null = null;
  if (scot) {
    const rest = raw.slice(scot[0].length);
    const rw = norm(rest).split(" ").filter(Boolean);
    const si = streetIndex(rw);
    const numsBefore = rw.slice(0, si >= 0 ? si : rw.length).filter(isNum);
    if (numsBefore.length) raw = `${scot[1]}f${scot[2]} ${rest}`; // a floor code, the building follows
    else {
      scotBuilding = scot[1].toLowerCase();
      scotUnit = scot[2].toLowerCase();
    }
  }
  const paren = raw.match(/\((\d[a-z]\d|\d+[a-z]?)\)/i);
  const words = norm(raw).split(" ").filter(Boolean);
  const nums = new Set(words.filter(isNum));
  const streetIdx = streetIndex(words);
  const street = streetIdx >= 0 ? words[streetIdx] : "";
  let building: string | null = null;
  let unit: string | null = null;
  let unitWord: "room" | "flat" | null = null;
  words.forEach((w, i) => {
    if (UNIT_WORDS.test(w)) {
      unitWord = unitWord ?? (/^(room|studio)$/.test(w) ? "room" : "flat");
      if (unit == null && words[i + 1] && isNum(words[i + 1])) unit = words[i + 1];
    }
  });
  if (scotBuilding != null) {
    building = scotBuilding;
    unit = scotUnit;
  } else {
    if (unit == null && paren) unit = paren[1].toLowerCase();
    const before = words.slice(0, streetIdx >= 0 ? streetIdx : words.length).filter(isNum);
    if (unit != null) {
      const i = before.indexOf(unit);
      if (i >= 0) before.splice(i, 1);
    }
    building = before.length ? before[before.length - 1] : null;
    if (unit == null && before.length >= 2) unit = before[0];
    if (building == null && unit == null && nums.size) building = [...nums][0]; // "The Lime Tree Court 5"
  }
  const front = words.filter((w) => DESCRIPTOR.test(w)).sort().join(" ");
  const sig = new Set(words.filter((w) => w.length > 3 && !isNum(w) && !FILLER.test(w) && !STREET_SUFFIX.test(w)));
  const ident = [unit, building].filter((x): x is string => x != null).sort().join("|");
  return { nums, building, unit, unitWord, street, front, sig, ident };
}

const same = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));
const covers = (big: Set<string>, small: Set<string>) => [...small].every((x) => big.has(x));
const addrOf = (p: MatchCandidate) => (p.locality ? `${p.name}, ${p.locality}` : p.name);

async function rexLookup(address: string): Promise<MatchCandidate[]> {
  if (!rexConfigured()) return [];
  const pc = postcodeOf(address);
  const a = parseAddress(address);
  const firstNum = a.building ?? [...a.nums][0] ?? "";
  const firstWord = norm(address).split(" ").find((w) => w.length > 3 && !isNum(w) && !FILLER.test(w)) ?? "";
  const queries = [...new Set([`${firstNum} ${a.street}`.trim(), `${firstNum} ${firstWord}`.trim(), a.street, pc ?? ""].filter((q) => q && q.length > 3))];
  const out = new Map<string, MatchCandidate>();
  for (const q of queries) {
    const res = await rexCall("Properties", "autocomplete", { search_string: q.slice(0, 120), limit: 12 }).catch(() => null);
    if (!res?.ok) continue;
    for (const r of rexRows(res.result) as { id?: unknown; address?: unknown }[]) {
      const id = String(r.id ?? "");
      if (id && !out.has(id)) out.set(id, { id, name: String(r.address ?? "").trim(), locality: "" });
    }
  }
  return [...out.values()];
}

/** The property an address names, by the backlog's rules. */
export async function matchProperty(address: string): Promise<MatchResult> {
  const pc = postcodeOf(address);
  if (!pc) return { verdict: "no match", how: "no postcode on the address", targets: [], possible: [] };
  const f = parseAddress(address);

  /* Everyone REX knows at the postcode: the book first, then REX's index. */
  const cands = new Map<string, MatchCandidate>();
  const book = await getComplianceBook().catch(() => null);
  for (const p of book?.book.properties ?? []) {
    const c = { id: String(p.id), name: p.name, locality: p.locality };
    if (postcodeOf(addrOf(c)) === pc) cands.set(c.id, c);
  }
  for (const p of await rexLookup(address)) if (!cands.has(p.id)) cands.set(p.id, p);
  const all = [...cands.values()].map((p) => ({ p, c: parseAddress(p.name), pc: postcodeOf(addrOf(p)) }));
  const here = all.filter((x) => x.pc === pc);
  const done = (list: typeof all, how: string, verdict: MatchResult["verdict"]): MatchResult => ({ targets: list.map((x) => x.p), how, verdict, possible: [] });
  const unsure = (how: string): MatchResult => ({
    targets: [],
    how,
    verdict: "no match",
    possible: [...here.map((x) => x.p), ...all.filter((x) => x.pc && x.pc !== pc && x.pc.split(" ")[0] === pc.split(" ")[0] && x.c.street === f.street && x.c.building === f.building).map((x) => x.p)].slice(0, 8),
  });

  const sameBuilding = here.filter((x) => f.building != null && x.c.building === f.building);
  const exact = here.filter((x) => (f.nums.size ? same(x.c.nums, f.nums) && x.c.ident === f.ident && x.c.front === f.front : !x.c.nums.size && x.c.sig.size >= 2 && covers(f.sig, x.c.sig)));
  if (exact.length) {
    const rooms = f.unit == null ? sameBuilding.filter((x) => x.c.unitWord === "room" && !exact.includes(x)) : [];
    if (rooms.length) return done([...exact, ...rooms], `exact, plus ${rooms.length} ${rooms.length === 1 ? "room" : "rooms"} REX holds under it`, "confident");
    return done(exact, exact.length > 1 ? `exact (REX holds it ${exact.length} times)` : "exact", "confident");
  }
  if (f.unit != null) {
    const unitHits = here.filter((x) => x.c.unit === f.unit && (f.building == null || x.c.building == null || x.c.building === f.building));
    const idents = new Set(unitHits.map((x) => x.c.ident));
    if (unitHits.length && idents.size === 1) return done(unitHits, `${f.building == null || unitHits[0].c.building == null ? "unit at this postcode" : "unit under the building"}${unitHits.length > 1 ? ` (REX holds it ${unitHits.length} times)` : ""}`, "confident");
  }
  const shared = f.unitWord === "room" || sameBuilding.some((x) => x.c.unitWord === "room");
  if (shared && sameBuilding.length) return done(sameBuilding, `shared house: ${sameBuilding.length} REX ${sameBuilding.length === 1 ? "record" : "records"} under ${f.building}`, "confident");
  if (f.unit == null && f.building != null && sameBuilding.length) return done(sameBuilding, sameBuilding.length === 1 ? "building, one unit under it" : `building: ${sameBuilding.length} units under it`, "confident");
  if (f.building != null) {
    const sup = sameBuilding.filter((x) => covers(x.c.nums, f.nums));
    if (sup.length === 1) return done(sup, "REX's line carries more, building and unit agree", "confident");
    const sub = sameBuilding.filter((x) => covers(f.nums, x.c.nums));
    if (sub.length === 1) return done(sub, "the address carries more than REX's line", "check");
    if (sameBuilding.length && f.unit != null && sameBuilding.every((x) => x.c.unit != null && x.c.unit !== f.unit)) return unsure(`REX has ${sameBuilding.length} at number ${f.building}, none is unit ${f.unit}`);
    if (sameBuilding.length === 1) return done(sameBuilding, "same building, unit unclear", "check");
  }
  const out = pc.split(" ")[0];
  const near = all.filter((x) => x.pc && x.pc !== pc && x.pc.split(" ")[0] === out && x.c.street === f.street && same(x.c.nums, f.nums));
  if (near.length) return { targets: near.map((x) => x.p), how: `postcode differs (REX ${near[0].pc})`, verdict: "check", possible: [] };
  return unsure(here.length ? `${here.length} at this postcode, none fit` : "nothing at this postcode");
}

/** "pending:flat-3-28-fosse-road-south-le3-0qd": where files wait for a property. */
export function pendingKeyFor(address: string): string {
  return `pending-${norm(address).replace(/\s+/g, "-").slice(0, 80)}`;
}
