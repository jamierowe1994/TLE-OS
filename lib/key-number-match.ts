/**
 * Does a typed search name a key? (26 Oct 2026, James: "can we add a search
 * function for key numbers within the search please".) Pure, so it can be
 * tried without a database; the index it runs over is lib/key-index.
 *
 * What REX's key register holds, read 26 Oct 2026: labels like "FM23",
 * "DJ D17", "C93", "2001", "SGFD05/GRANG/12814/7(S)", "CB24/6901-branch-".
 * So a label is cut down to the numbers on it:
 *
 *   - the office tail goes: "-branch-" and a bracket at the end, "(S)";
 *   - the whole label, each part between slashes, and each word with a
 *     letter and a digit in it ("D17" of "DJ D17") is a form it answers to;
 *   - spaces and punctuation never count: "dj d17", "DJD17", "dj/d17";
 *   - zeros in front of a number never count: "sgfd5" is SGFD05, "L6" is L006.
 *
 * A search with a digit in it meets a form exactly (2), or is the start of one
 * when it has a letter too (1): "FM2" finds FM21 to FM24 while you type, but
 * a bare "12" is only ever key 12 - a house number must not bring up every
 * key starting 12. Three words or a whole postcode is an address, not a key.
 */

const compact = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
const unpad = (s: string) => s.replace(/\d+/g, (d) => d.replace(/^0+(?=\d)/, ""));
const POSTCODE = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i;

/** The forms a label answers to, compacted, each with a digit in it. */
export function keyForms(label: string): string[] {
  const core = label.replace(/-\s*branch\s*-?\s*$/i, "").replace(/\s*\([^)]*\)\s*$/, "").trim();
  const parts = [core, ...core.split(/[/,&]|\band\b/i)];
  const words = core.split(/[\s/,&]+/).filter((w) => /[a-z]/i.test(w) && /\d/.test(w));
  return [...new Set([...parts, ...words].map(compact).filter((f) => /\d/.test(f)))];
}

/** The typed search as a key, or null when it cannot be one. */
export function keyNeedle(needle: string): { raw: string; bare: string; partial: boolean } | null {
  const t = needle.trim();
  if (t.includes("@") || POSTCODE.test(t) || t.split(/\s+/).length > 2) return null;
  const raw = compact(t);
  if (raw.length < 2 || raw.length > 20 || !/\d/.test(raw)) return null;
  return { raw, bare: unpad(raw), partial: /[A-Z]/.test(raw) };
}

/** 2 the key itself, 1 a key it starts, 0 not this key. */
export function keyRank(n: NonNullable<ReturnType<typeof keyNeedle>>, forms: string[]): 0 | 1 | 2 {
  if (forms.some((f) => unpad(f) === n.bare)) return 2;
  if (n.partial && forms.some((f) => f.startsWith(n.raw) || unpad(f).startsWith(n.bare))) return 1;
  return 0;
}

/** "SGFD05/GRANG/12814/7(S)" as the office would say it: "SGFD05/GRANG/12814/7". */
export function keyShown(label: string): string {
  return label.replace(/-\s*branch\s*-?\s*$/i, "").replace(/\s*\([^)]*\)\s*$/, "").trim() || label.trim();
}
