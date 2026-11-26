import type { Country, TermsDoc } from "@/lib/terms/types";
import { SCOTLAND_DEC24 } from "@/lib/terms/scotland";
import { SCOTLAND_OCT26 } from "@/lib/terms/scotland-oct26";
import { ENGLAND_OCT26 } from "@/lib/terms/england-oct26";
import { ENGLAND_NOV26 } from "@/lib/terms/england-nov26";
import { SCOTLAND_NOV26 } from "@/lib/terms/scotland-nov26";

/**
 * Every edition of the terms the OS can send, by id, and which one is current
 * for each country.
 *
 * A contract stores the id it went out on, so changing the current edition
 * never rewrites one already signed: the old edition stays here for as long as
 * any contract on it exists. England joined on 23 Oct 2026 on its October
 * 2026 wording (TLE_TOB_England_Oct26.pdf).
 */
export const EDITIONS: Record<string, TermsDoc> = {
  [SCOTLAND_DEC24.id]: SCOTLAND_DEC24,
  [SCOTLAND_OCT26.id]: SCOTLAND_OCT26,
  [ENGLAND_OCT26.id]: ENGLAND_OCT26,
  [ENGLAND_NOV26.id]: ENGLAND_NOV26,
  [SCOTLAND_NOV26.id]: SCOTLAND_NOV26,
};

export const CURRENT: Partial<Record<Country, string>> = {
  /* October 2026 from 23 Oct 2026 (TLE_TOB_Scotland_Oct26.pdf); December 2024 stays for anything sent on it. */
  scotland: SCOTLAND_OCT26.id,
  /* October 2026 from 23 Oct 2026 (TLE_TOB_England_Oct26.pdf): every home outside Scotland. */
  england: ENGLAND_OCT26.id,
};

/**
 * The November 2026 wording (Susan Liles, 4 Nov 2026): bank details and the
 * landlord declarations on page 2, and the questions about the home asked
 * before the contract. Sent by whoever has the "Questions before signing"
 * switch on (lib/new-look termsqs) until it becomes CURRENT for everyone.
 */
export const NEXT: Partial<Record<Country, string>> = {
  scotland: SCOTLAND_NOV26.id,
  england: ENGLAND_NOV26.id,
};

/**
 * REVISIONS (James, 26 Nov 2026): the wording Susan has changed in My
 * Business > Contracts. A revision is a whole contract with the id
 * "<edition>~r<n>", kept in the database (lib/terms/revisions), and the
 * newest one of an edition is what goes out in that edition's place. They are
 * registered here so these look-ups stay plain functions: the server loads
 * them before it reads a contract (lib/terms/revisions ensureRevisions) and
 * the send screen asks for them (lib/terms/use-revisions).
 *
 * With none registered every answer is exactly what it was before.
 */
const REVISED = new Map<string, TermsDoc>();
const LATEST = new Map<string, string>();

/** `latest`: edition id -> the revision id that now goes out in its place. */
export function registerRevisions(docs: TermsDoc[], latest: Record<string, string>, replace = false): void {
  if (replace) {
    REVISED.clear();
    LATEST.clear();
  }
  for (const d of docs) REVISED.set(d.id, d);
  for (const [base, id] of Object.entries(latest)) LATEST.set(base, id);
}

/** "england-nov26~r3" -> "england-nov26". */
export const baseEditionId = (id: string): string => id.split("~")[0];
export const isRevision = (id: string): boolean => id.includes("~r");

/** The edition agents send for a country today: the November wording where there is one. */
export function sendingEditionId(country: Country): string | null {
  return NEXT[country] ?? CURRENT[country] ?? null;
}

export function editionFor(country: Country, next = false): TermsDoc | null {
  const id = (next ? NEXT[country] : null) ?? CURRENT[country];
  if (!id) return null;
  const revised = LATEST.get(id);
  return (revised ? REVISED.get(revised) : null) ?? EDITIONS[id] ?? null;
}

export const edition = (id: string): TermsDoc | null => REVISED.get(id) ?? EDITIONS[id] ?? null;
