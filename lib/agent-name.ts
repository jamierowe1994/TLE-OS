/**
 * Is this record's agent this person? By name, because that is what REX
 * stamps on an application, an appraisal or a viewing.
 *
 * Every "is this yours" check compared the two names exactly, and four agents'
 * names in the OS are not REX's (4 Nov 2026): "Lianna Jane Denholm" / "Lianna
 * Denholm", "Ed Westwood" / "Edward Westwood", "MR ZILVINAS NAVICKIS" /
 * "Zilvinas Navickis", "Paul Nelson Brighton Letting Expert" / "Paul Nelson".
 * Lianna's own let at 12 South Chesters Lane answered "That application is
 * Lianna's", so its landlord could not be read and the page and Steve both
 * said there was none - the landlord was there all along.
 *
 * The same person when, titles and case aside:
 *   - the names are the same;
 *   - one is the start of the other, at least two words long ("Paul Nelson");
 *   - first and last names agree (a middle name);
 *   - the surnames agree and one first name is the start of the other ("Ed").
 * Pure, so the browser can use it too.
 */
const TITLES = new Set(["mr", "mrs", "ms", "miss", "mx", "dr"]);

function words(name: string | null | undefined): string[] {
  return (name ?? "")
    .toLowerCase()
    .replace(/[^a-z'\-\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !TITLES.has(w));
}

export function sameAgent(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = words(a);
  const y = words(b);
  if (!x.length || !y.length) return false;
  if (x.join(" ") === y.join(" ")) return true;
  if (x.length < 2 || y.length < 2) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short.every((w, i) => long[i] === w)) return true;
  if (x[x.length - 1] !== y[y.length - 1]) return false;
  if (x[0] === y[0]) return true;
  return Math.min(x[0].length, y[0].length) >= 2 && (x[0].startsWith(y[0]) || y[0].startsWith(x[0]));
}
