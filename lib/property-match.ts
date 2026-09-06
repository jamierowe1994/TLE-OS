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

import { parseAddress, postcodeOf, norm, same, covers, addrOf } from "@/lib/address-parse";
export { postcodeOf, parseAddress };
const FILLER = /^(flat|room|apartment|unit|apt|studio|floor|the|ground|first|second|third|top|basement|lower|upper|gff|fff|house|rear|front)$/;
const isNum = (w: string) => /\d/.test(w);

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
    /* A certificate filed on ONE room of a shared house is the house's (James,
       6 Sep, 2 Norwich Street): it goes on every room and the house too. */
    const family = f.unitWord === "room" ? sameBuilding.filter((x) => !exact.includes(x)) : [];
    if (family.length) return done([...exact, ...family], `room of a shared house: the house and its ${sameBuilding.length} records`, "confident");
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
