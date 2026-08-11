/**
 * Is this person already in REX?
 *
 * Four facts, a quarter each, exactly as the business scores it: name,
 * address, mobile, email. Four out of four is the same person and the OS says
 * so; anything less is offered as a maybe, with the score shown, so whoever is
 * typing can look and decide.
 *
 * The scoring is deliberately blunt — a quarter is won or it isn't — but the
 * COMPARING is not. "07712 345678", "+44 7712 345678" and "07712345678" are
 * one mobile; "Chloe Adams", "chloe adams" and "Adams, Chloe" are one person;
 * "NG1 1DG" and "ng11dg" are one postcode. Without that, a book with 87,000
 * contacts in it would score almost every genuine duplicate at 0.
 *
 * A quarter can also be UNKNOWABLE. If REX holds no address for someone, the
 * address quarter can never be won, and a real duplicate tops out at 75%. That
 * is not a weak match, it is an unanswered question — so the comparison of
 * every field is reported, and the screen can say "no address on file" rather
 * than implying a mismatch.
 */

export type Facet = "name" | "address" | "mobile" | "email";

export type FacetVerdict = "match" | "differs" | "unknown";

export interface ContactCandidate {
  id: string;
  name: string;
  email: string | null;
  mobile: string | null;
  address: string | null;
  /** Where REX's own record came from, for the "why did this surface" line. */
  foundBy: Facet[];
}

export interface ScoredMatch extends ContactCandidate {
  /** 0, 25, 50, 75 or 100. */
  score: number;
  facets: Record<Facet, FacetVerdict>;
}

export interface Enquirer {
  name?: string | null;
  email?: string | null;
  mobile?: string | null;
  address?: string | null;
}

const TITLES = /^(mr|mrs|ms|miss|dr|prof|sir|madam|mx)\b\.?\s*/i;

export function normaliseName(v: string | null | undefined): string {
  if (!v) return "";
  let s = String(v).toLowerCase().replace(TITLES, "");
  // "Adams, Chloe" is "Chloe Adams" with the comma doing the work.
  if (s.includes(",")) {
    const [last, first] = s.split(",", 2);
    s = `${first ?? ""} ${last ?? ""}`;
  }
  return s.replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function normaliseEmail(v: string | null | undefined): string {
  return v ? String(v).trim().toLowerCase() : "";
}

/**
 * The last nine digits, which is what actually identifies a UK number however
 * it was typed: 0044, +44, 44, a leading 0 and any spacing all fall away.
 */
export function normalisePhone(v: string | null | undefined): string {
  if (!v) return "";
  const digits = String(v).replace(/\D/g, "");
  if (digits.length < 9) return "";
  return digits.slice(-9);
}

const POSTCODE = /([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})/i;

/** A postcode and the first number in the line, which together are enough. */
export function addressKey(v: string | null | undefined): { postcode: string; number: string } | null {
  if (!v) return null;
  const m = POSTCODE.exec(String(v));
  if (!m) return null;
  const number = (/(?:^|\s)(\d+[a-z]?)\b/i.exec(String(v))?.[1] ?? "").toLowerCase();
  return { postcode: `${m[1]}${m[2]}`.toLowerCase(), number };
}

function compare(a: string, b: string): FacetVerdict {
  if (!a || !b) return "unknown";
  return a === b ? "match" : "differs";
}

function compareAddress(a: string | null | undefined, b: string | null | undefined): FacetVerdict {
  const x = addressKey(a);
  const y = addressKey(b);
  if (!x || !y) return "unknown";
  if (x.postcode !== y.postcode) return "differs";
  // Same postcode, and neither side names a number: close enough to count.
  if (!x.number || !y.number) return "match";
  return x.number === y.number ? "match" : "differs";
}

/** Score one REX contact against what has been typed. */
export function score(enquirer: Enquirer, candidate: ContactCandidate): ScoredMatch {
  const facets: Record<Facet, FacetVerdict> = {
    name: compare(normaliseName(enquirer.name), normaliseName(candidate.name)),
    address: compareAddress(enquirer.address, candidate.address),
    mobile: compare(normalisePhone(enquirer.mobile), normalisePhone(candidate.mobile)),
    email: compare(normaliseEmail(enquirer.email), normaliseEmail(candidate.email)),
  };
  const won = (Object.values(facets) as FacetVerdict[]).filter((v) => v === "match").length;
  return { ...candidate, facets, score: won * 25 };
}

export function scoreAll(enquirer: Enquirer, candidates: ContactCandidate[]): ScoredMatch[] {
  return candidates
    .map((c) => score(enquirer, c))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

/** Enough to bother REX with — one hard identifier, or a name to go on. */
export function worthSearching(e: Enquirer): boolean {
  return Boolean(
    normaliseEmail(e.email) ||
      normalisePhone(e.mobile) ||
      normaliseName(e.name).split(" ").filter(Boolean).length >= 2
  );
}
