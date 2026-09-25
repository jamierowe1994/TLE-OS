/**
 * NO EM DASHES IN AN ADVERT (Howard, 24 Sep 2026; James's copy rule).
 *
 * The writers are told not to use them, and do anyway. So everything that
 * writes or saves a listing description passes through here: an em or en
 * dash between words becomes " - ", and one inside a range ("2–3 bedrooms")
 * becomes a plain hyphen. Line breaks around a dash are kept, so paragraphs
 * never run together. No other character is touched.
 */
export function noDashes(s: string): string {
  return s
    .replace(/[ \t]*[—―][ \t]*/g, " - ")
    .replace(/(\S)–(\S)/g, "$1-$2")
    .replace(/[ \t]*–[ \t]*/g, " - ")
    .replace(/^ - /gm, "- ")
    .replace(/ - $/gm, " -")
    .replace(/ {2,}/g, " ");
}
