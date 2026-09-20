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

/** An HMO, as the property type says it - "HMO", "House in multiple occupation". */
export function isHmoType(type: string | null | undefined): boolean {
  const t = (type ?? "").toLowerCase();
  return /\bhmo\b/.test(t) || t.includes("multiple occupation");
}
