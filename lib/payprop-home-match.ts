import { parseAddress, postcodeOf, sameHome } from "@/lib/address-parse";
import { rentKey } from "@/lib/business/payprop-portfolio";

/*
 * WHICH PAYPROP PROPERTY IS THIS HOME (Lianna Denholm, 22 Oct 2026).
 *
 * Ten of Lianna's Edinburgh homes showed "- pcm" while PayProp billed every
 * one of them. The old join was rentKey - first number, first street word,
 * postcode - and it lost homes three ways:
 *   - two flats in one stair share it: "Brougham Place 7 (2f2)" and
 *     "(3f1)" are both 7|brougham|EH39HW, so both were dropped as unsure;
 *   - the postcode differs or is cut short: REX PM's 2 Blackcot Road is
 *     EH22 5SR, PayProp's EH22 5SU; PayProp's 97/2 Inverleith Row is "EH3";
 *   - no house number at all: Laundry Cottage, Lynedoch Place Lane.
 *
 * This reads the whole door instead (lib/address-parse): the same street,
 * the same building and flat, and a postcode that agrees - in full first,
 * then the same district where one side is short or a letter out. PayProp's
 * property name is tried before its first line, because a room's first line
 * is its house's ("166 Gloucester Road North" on every room there). Only
 * then the looser readings, Scotland's floor codes spelt every which way
 * ("Flat 1/1/4 Inchinnan Road" is PayProp's "Inchinnan Road Flat 1/1, 4"),
 * and last the old key. Every stage wants exactly one answer; two is
 * "unsure", never a pick.
 */

export type PayPropPlace = { account: string; id: string; name: string; firstLine: string; postcode: string };
export type PayPropHit = { id: string; account: string };
export type HomeAddress = { name: string; address?: string | null; postcode: string | null };

const pcFull = (s: string | null | undefined) => (postcodeOf(s ?? "") ?? "").replace(/\s+/g, "");
const district = (s: string | null | undefined): string | null => {
  const full = postcodeOf(s ?? "");
  if (full) return full.split(" ")[0];
  const n = String(s ?? "").toUpperCase().replace(/\s+/g, "");
  return /^[A-Z]{1,2}\d[A-Z\d]?$/.test(n) ? n : null;
};
const stripPostcode = (s: string) => s.replace(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/gi, " ").replace(/[\s,]+$/, "").trim();
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** 1 = same postcode, 2 = same district (one side short or a letter out), 3 = the home has no usable postcode. */
function postcodeTier(home: HomeAddress, p: PayPropPlace): 0 | 1 | 2 | 3 {
  const a = pcFull(home.postcode), b = pcFull(p.postcode);
  if (a && b && a === b) return 1;
  const da = district(home.postcode), db = district(p.postcode);
  if (da && db && da === db) return 2;
  return da ? 0 : 3;
}

/** One home line against one PayProp line: the same door, and a room is never a whole house. */
function sameDoorAs(a: string, b: string): boolean {
  if (words(a) === words(b)) return true;
  if (!sameHome(a, b)) return false;
  const x = parseAddress(a), y = parseAddress(b);
  if ((x.unitWord === "room" && x.unit != null && y.unit == null) || (y.unitWord === "room" && y.unit != null && x.unit == null)) return false;
  /* "Basement Flat" is not "First Floor Flat" at the same number. */
  return !x.front || !y.front || x.front === y.front;
}

/** The numbers on a line, in order of size, floor codes ("2f2") read as their digits or left out. */
function numbersOn(s: string, floors: boolean): string {
  let t = stripPostcode(s).toLowerCase();
  if (!floors) t = t.replace(/\b\d+\s*f\s*\d+\b|\(\s*\d+f\s*\)/g, " ");
  return (t.match(/\d+/g) ?? []).map(Number).sort((m, n) => m - n).join(",");
}
const floorCode = (s: string) => (s.toLowerCase().match(/\b(\d+f\d+)\b/) ?? [])[1] ?? null;
const firstNumber = (s: string) => (stripPostcode(s).match(/\d+/) ?? [])[0] ?? null;

/** Scotland's flats, however the slashes fall: the same street and the same numbers. */
function sameNumbers(a: string, b: string): boolean {
  const x = parseAddress(a), y = parseAddress(b);
  if (!x.street || x.street !== y.street) return false;
  if ((x.unitWord === "room") !== (y.unitWord === "room")) return false;
  for (const floors of [true, false]) {
    const m = numbersOn(a, floors), n = numbersOn(b, floors);
    if (m && m === n && m.includes(",")) return true;
  }
  /* "Argyle Place 42/6 (3f2)" is PayProp's "Argyle Place 42 (3f2)": the same floor code at the same number. */
  const fa = floorCode(a);
  return Boolean(fa && fa === floorCode(b) && firstNumber(a) === firstNumber(b));
}

function only(hits: PayPropPlace[], hasRent?: (p: PayPropPlace) => boolean): PayPropHit | "unsure" | null {
  const ids = [...new Map(hits.map((p) => [`${p.account}|${p.id}`, p])).values()];
  if (!ids.length) return null;
  if (ids.length === 1) return { id: ids[0].id, account: ids[0].account };
  /* The same flat twice in PayProp (Albany Court's Flat 3): the record billing a rent now is the live one. */
  const live = hasRent ? ids.filter(hasRent) : [];
  return live.length === 1 ? { id: live[0].id, account: live[0].account } : "unsure";
}

/**
 * The one PayProp property that is this home, "none" when PayProp holds no
 * such home, or "unsure" when two could be it. `hasRent` breaks a tie between
 * two PayProp records of the very same address.
 */
export function matchPayPropHome(home: HomeAddress, places: PayPropPlace[], hasRent?: (p: PayPropPlace) => boolean): PayPropHit | "none" | "unsure" {
  const lines = [...new Set([home.address, home.name].map((s) => stripPostcode(String(s ?? ""))).filter(Boolean))];
  if (!lines.length) return "none";
  const near = places.map((p) => ({ p, tier: postcodeTier(home, p) })).filter((x) => x.tier > 0);
  /* A room's or a flat's first line is often the building's, so it stands in only for a name with no flat or room in it. */
  const firstLineOk = (p: PayPropPlace) => {
    const n = parseAddress(p.name);
    return Boolean(p.firstLine) && n.unit == null && !n.front;
  };
  const stages: Array<(p: PayPropPlace, tier: number) => boolean> = [
    (p, tier) => tier < 3 && lines.some((a) => sameDoorAs(a, p.name)),
    (p, tier) => tier < 3 && firstLineOk(p) && lines.some((a) => sameDoorAs(a, p.firstLine)),
    (p, tier) => tier < 3 && lines.some((a) => sameNumbers(a, p.name) || (firstLineOk(p) && (sameNumbers(a, p.firstLine) || sameNumbers(a, `${p.firstLine} ${p.name}`)))),
    /* No postcode worth the name on the home ("FK"): only the same words will do. */
    (p, tier) => tier === 3 && lines.some((a) => [p.name, p.firstLine].some((b) => b && (words(a) === words(b) || words(a).startsWith(`${words(b)} `)))),
  ];
  for (const stage of stages) {
    for (const tier of [1, 2, 3]) {
      const hit = only(near.filter((x) => x.tier === tier && stage(x.p, tier)).map((x) => x.p), hasRent);
      if (hit) return hit;
    }
  }
  /* Last, the old key, where it names one property alone: REX PM's "9 Wilson Court/15 Wilson Street". */
  const want = rentKey(home.address || home.name, home.postcode);
  if (!want) return "none";
  const keyed = near.filter((x) => x.tier === 1).map((x) => x.p).filter((p) => rentKey(p.name || p.firstLine, p.postcode) === want || rentKey(p.firstLine || p.name, p.postcode) === want);
  const hit = only(keyed, hasRent);
  if (hit === "unsure" || !hit) return hit ?? "none";
  const p = keyed.find((x) => x.id === hit.id && x.account === hit.account)!;
  const x = parseAddress(lines[0]), y = parseAddress(p.name || p.firstLine);
  return (x.unitWord === "room") === (y.unitWord === "room") ? hit : "none";
}
