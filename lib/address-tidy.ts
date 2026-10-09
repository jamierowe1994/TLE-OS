/**
 * An address's first line the way a person writes it - pure, client-safe.
 *
 * James, 9 Oct 2026: typing "6 Ruskin Place" did not find the home, because
 * REX PM spells it "Ruskin Place 6, Dalkeith". Its export puts the number
 * after the street ("Douglas Gardens Mews 6A"), the flat after the street
 * ("Lang Rigg, Flat 1, 5") and repeats the town ("Ruskin Place 6, Dalkeith,
 * Dalkeith"). So every line reads:
 *
 *   - the flat, room or apartment first:      "Flat 1, 5 Lang Rigg"
 *   - the house number before the street:     "6 Ruskin Place"
 *   - a lone number joins the street before:  "Lang Rigg, Flat 5, 3" -> "Flat 5, 3 Lang Rigg"
 *   - Scotland's floor code first too:        "Low Waters Road 12, 0/2" -> "0/2, 12 Low Waters Road"
 *   - the same part twice, once:              "Dalkeith, Dalkeith" -> "Dalkeith"
 *   - the town left off when it is shown beside the line anyway
 *   - a line typed all in lower case gets its capitals back
 *
 * Applied where the line is read (lib/os-properties), never written back:
 * the REX PM import would only put the old spelling back, and REX itself is
 * not ours to change. A line already written the Scottish way ("0/1, 11
 * Firpark", "109/2 Moredun Park Road") comes through as it is.
 * The raw address is kept beside the tidy line, so searching either finds it
 * and rent matching (lib/business/payprop-portfolio rentKey) keys on the
 * same string it always has.
 */

const UNIT = /^(?:(flat|apartment|apt|room|unit|studio)\s*[a-z0-9]+(?:\s*[a-z])?|\d+[a-z]?\s*\/\s*\d+[a-z]?)$/i; // "Flat 3", or Scotland's floor code "0/2"
const BARE_NUMBER = /^\d+[a-z]?$/i;
const POSTCODE = /^[a-z]{1,2}\d[a-z\d]?\s*\d[a-z]{2}$/i;
/* "Douglas Gardens Mews 6A": words, then a house number at the end. */
const NUMBER_LAST = /^([a-z][a-z.'’ -]*[a-z.])\s+(\d+[a-z]?)$/i;
/* Words that take a number after them and are not a street: "Block 2". */
const NOT_A_STREET = /^(block|building|floor|level|phase|plot|suite|house|unit|flat|apartment|apt|room|studio|bedroom)\b/i;

const hasDigit = (s: string) => /\d/.test(s);
const capitalise = (s: string) => (s === s.toLowerCase() && /[a-z]/.test(s) ? s.replace(/(^|[\s-])([a-z])/g, (_m, a: string, b: string) => a + b.toUpperCase()) : s);

export function tidyAddressLine(line: string | null | undefined, opts: { town?: string | null } = {}): string {
  const raw = String(line ?? "").trim();
  if (!raw) return raw;
  let parts = raw
    .split(",")
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (!parts.length) return raw;

  /* The same part twice in a row, once; and a part that says its words twice
     ("Douglas Gardens Mews Douglas Gardens Mews", REX), once. */
  parts = parts.map((p) => {
    const w = p.split(" ");
    const half = w.length / 2;
    return w.length % 2 === 0 && w.slice(0, half).join(" ").toLowerCase() === w.slice(half).join(" ").toLowerCase() ? w.slice(0, half).join(" ") : p;
  });
  parts = parts.filter((p, i) => i === 0 || p.toLowerCase() !== parts[i - 1].toLowerCase());

  /* The town and postcode are shown beside the line; drop them from its end. */
  const town = String(opts.town ?? "").trim().toLowerCase();
  while (parts.length > 1) {
    const last = parts[parts.length - 1];
    if (POSTCODE.test(last) || (town && last.toLowerCase() === town)) parts.pop();
    else break;
  }

  /* "Ruskin Place 6" -> "6 Ruskin Place". */
  parts = parts.map((p) => {
    const m = p.match(NUMBER_LAST);
    return m && !NOT_A_STREET.test(m[1]) ? `${m[2]} ${m[1]}` : p;
  });

  /* A lone number belongs to the street before it ("Lang Rigg, Flat 1, 5"),
     or to the street after it when that street has no number of its own
     ("6A, Douglas Gardens Mews"). Before a numbered street it is a flat
     ("504, 50 Warwick Street") and stays where it is. */
  for (let i = 0; i < parts.length; i++) {
    if (!BARE_NUMBER.test(parts[i])) continue;
    const isStreet = (p: string) => !hasDigit(p) && !UNIT.test(p) && !NOT_A_STREET.test(p);
    let j = -1;
    for (let k = i - 1; k >= 0; k--) if (isStreet(parts[k])) { j = k; break; }
    if (j < 0 && parts[i + 1] && isStreet(parts[i + 1])) j = i + 1;
    if (j < 0) continue;
    parts[j] = `${parts[i]} ${parts[j]}`;
    parts.splice(i, 1);
    i = -1; // indices moved; start again
  }

  /* The flat or room first. */
  const units = parts.filter((p) => UNIT.test(p));
  if (units.length && units.length < parts.length) parts = [...units, ...parts.filter((p) => !UNIT.test(p))];

  return parts.map(capitalise).join(", ");
}
