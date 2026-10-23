import type { Country, TermsDoc } from "@/lib/terms/types";
import { SCOTLAND_DEC24 } from "@/lib/terms/scotland";
import { SCOTLAND_OCT26 } from "@/lib/terms/scotland-oct26";
import { ENGLAND_OCT26 } from "@/lib/terms/england-oct26";

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
};

export const CURRENT: Partial<Record<Country, string>> = {
  /* October 2026 from 23 Oct 2026 (TLE_TOB_Scotland_Oct26.pdf); December 2024 stays for anything sent on it. */
  scotland: SCOTLAND_OCT26.id,
  /* October 2026 from 23 Oct 2026 (TLE_TOB_England_Oct26.pdf): every home outside Scotland. */
  england: ENGLAND_OCT26.id,
};

export function editionFor(country: Country): TermsDoc | null {
  const id = CURRENT[country];
  return id ? EDITIONS[id] ?? null : null;
}

export const edition = (id: string): TermsDoc | null => EDITIONS[id] ?? null;
