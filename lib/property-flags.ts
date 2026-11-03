/**
 * TWO THINGS ABOUT A PROPERTY THAT CHANGE WHAT IT NEEDS.
 *
 * James, 20 Sep 2026: "anyone that's under a Scottish postcode or property
 * address, we'll then offer custom options ... if it gets marked under
 * property type as an HMO, that's when we'll offer different options".
 *
 * OFFER, not impose: both only ever suggest a set of documents to tick on
 * the appraisal (components/appraisal/RequiredDocs). The agent is still the
 * one who decides, because the OS cannot see a licence that was never
 * needed or a flat that is only half in Scotland.
 *
 * Client-safe: the appraisal screen reads it as you type.
 */

/** Every Scottish postcode area. Scotland's law differs, and the postcode is
 *  the only part of an address that is never wrongly spelled. */
export const SCOTTISH_AREAS = [
  "AB", "DD", "DG", "EH", "FK", "G", "HS", "IV", "KA", "KW", "KY", "ML", "PA", "PH", "TD", "ZE",
] as const;

/** The area letters at the front of a postcode, from anywhere in a string. */
function areaOf(text: string | null | undefined): string | null {
  const m = /\b([A-Z]{1,2})\d[A-Z\d]?\s*\d[A-Z]{2}\b/i.exec(text ?? "");
  return m ? m[1].toUpperCase() : null;
}

/**
 * Scottish? By postcode area, from the postcode or the address it sits in.
 *
 * Borders warning: a few areas straddle the line (TD and DG run into England,
 * CA and NE run into Scotland), which is exactly why this suggests rather
 * than decides.
 */
export function isScottish(...text: Array<string | null | undefined>): boolean {
  const area = text.map(areaOf).find(Boolean);
  return area ? (SCOTTISH_AREAS as readonly string[]).includes(area) : false;
}

/* ENGLAND, WALES OR SCOTLAND (Susan Liles, 3 Nov 2026: "maybe we separate
   Wales as legislation is different for each region"). Decided by the postcode
   DISTRICT, because three border areas split: CH5-CH8 and SY15-SY25 are in
   Wales (CH8 is Holywell), and TD15 is Berwick, in England. */

/** Postcode areas wholly in Wales. */
export const WELSH_AREAS = ["CF", "LD", "LL", "NP", "SA"] as const;
/** Areas that aren't any of the three (Northern Ireland, the islands). */
const NOT_GB_MAINLAND = new Set(["BT", "GY", "JE", "IM"]);

export type Nation = "england" | "wales" | "scotland";

/** Area and district from a postcode field - a full postcode, or the outward half alone ("EH3"). */
function outwardOf(postcode: string | null | undefined): { area: string; district: number } | null {
  const m = /^\s*([A-Z]{1,2})(\d{1,2})[A-Z]?(?:\s*\d[A-Z]{2})?\s*$/i.exec(postcode ?? "");
  return m ? { area: m[1].toUpperCase(), district: Number(m[2]) } : null;
}

/** The same, from a full postcode anywhere in an address. */
function outwardInText(text: string | null | undefined): { area: string; district: number } | null {
  const m = /\b([A-Z]{1,2})(\d{1,2})[A-Z]?\s*\d[A-Z]{2}\b/i.exec(text ?? "");
  return m ? { area: m[1].toUpperCase(), district: Number(m[2]) } : null;
}

function nationOfOutward({ area, district }: { area: string; district: number }): Nation | null {
  if (NOT_GB_MAINLAND.has(area)) return null;
  if ((WELSH_AREAS as readonly string[]).includes(area)) return "wales";
  if (area === "CH" && district >= 5 && district <= 8) return "wales";
  if (area === "SY" && district >= 15 && district <= 25) return "wales";
  if (area === "TD" && district === 15) return "england";
  if ((SCOTTISH_AREAS as readonly string[]).includes(area)) return "scotland";
  return "england";
}

/**
 * England, Wales or Scotland for a home: its postcode field first (a full
 * postcode or just the outward half), then a postcode written into the
 * address, then Edinburgh, Glasgow, Cardiff or Swansea by name. Null when none of them says -
 * never a guess, so the caller can list the home rather than misplace it.
 */
export function nationOf(postcode: string | null | undefined, ...text: Array<string | null | undefined>): Nation | null {
  const out = outwardOf(postcode) ?? text.map(outwardInText).find(Boolean) ?? null;
  if (out) return nationOfOutward(out);
  const words = text.join(" ");
  if (/\b(edinburgh|glasgow)\b/i.test(words)) return "scotland";
  if (/\b(cardiff|swansea)\b/i.test(words)) return "wales";
  return null;
}

/** An HMO, as the property type says it - "HMO", "House in multiple occupation". */
export function isHmoType(type: string | null | undefined): boolean {
  const t = (type ?? "").toLowerCase();
  return /\bhmo\b/.test(t) || t.includes("multiple occupation");
}
