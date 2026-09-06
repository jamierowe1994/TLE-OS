/**
 * An address, taken apart - pure, client-safe. Shared by the server-side
 * matcher (lib/property-match), the compliance book's house-and-rooms
 * grouping and the Portfolio screen. See lib/property-match for the rules
 * and their history (the certificate backlog, 6 Sep 2026).
 */

const POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;
const UNIT_WORDS = /^(flat|room|apartment|unit|apt|studio)$/;
const FILLER = /^(flat|room|apartment|unit|apt|studio|floor|the|ground|first|second|third|top|basement|lower|upper|gff|fff|house|rear|front)$/;
const DESCRIPTOR = /^(basement|ground|first|second|third|top|lower|upper|gff|fff|rear|front|garden|penthouse|annexe?)$/;
const STREET_SUFFIX = /^(road|street|avenue|lane|close|drive|way|place|terrace|gardens|court|crescent|square|grove|walk|park|hill|mews|row|green|view|rise|wynd|quay|parade|vale|gate|loan|brae)$/;

export function postcodeOf(s: string): string | null {
  const m = String(s).match(POSTCODE);
  return m ? `${m[1]} ${m[2]}`.toUpperCase() : null;
}

export function norm(s: string): string {
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

export interface Parsed {
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
  /* "Room 1/5a Newton Road", "Room 2 / 66a Fore Street": the slash after a
     unit is a comma, not a floor code. */
  raw = raw.replace(/^(\s*(?:room|studio|bed(?:room)?|flat|apartment|unit)\s*[a-z0-9]+)\s*\/\s*/i, "$1, ");
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

export const same = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));
export const covers = (big: Set<string>, small: Set<string>) => [...small].every((x) => big.has(x));
export const addrOf = (p: { name: string; locality: string }) => (p.locality ? `${p.name}, ${p.locality}` : p.name);


/**
 * The house a record belongs to: postcode + building number + street word.
 * "Room 2, 2 Norwich Street, PE13 2LE" and "2 Norwich Street, PE13 2LE"
 * share a key; "Flat 3, 28 Fosse Road" shares one with "Flat 4, 28 Fosse
 * Road" too, but flats are separate homes and callers only group ROOMS.
 */
export function houseKeyOf(address: string): string | null {
  const pc = postcodeOf(address);
  const p = parseAddress(address);
  if (!pc || p.building == null) return null;
  return `${pc}|${p.building}|${p.street}`;
}

/** A room or studio in a shared house, by the address alone. */
export function isRoomAddress(address: string): boolean {
  return parseAddress(address).unitWord === "room";
}

/** The house's own line, from a room's: "Room 2, 2 Norwich Street, Wisbech PE13 2LE" → "2 Norwich Street, Wisbech PE13 2LE". */
export function houseNameFrom(address: string): string {
  return address.replace(/^\s*(room|studio|bed(room)?)\s*[a-z0-9]+\s*[,/-]?\s*/i, "").trim();
}
