import { parseAddress, sameDoor } from "@/lib/address-parse";

/**
 * How a typed search meets a record (6 Oct 2026, "room 2" at 5b Newton Road).
 * Pure, so the search bar, Steve and the phone's lists all match the same way.
 *
 * It used to be one substring test on the whole phrase: "room 2" found Room 20
 * to Room 29 in every shared house, and "5b newton" missed "Room 2, 5b Newton
 * Road" because the words were not side by side. Now:
 *
 *   - the phrase is split into words, and EVERY word has to appear somewhere
 *     in the record, in any order ("newton 5b room 2" finds it too);
 *   - a word with a digit in it is a whole word: "2" is Room 2, never Room 20,
 *     and "5b" is never "15b";
 *   - a word without one may start a word ("newt" finds Newton);
 *   - five or more digits still match a phone number however it is spaced.
 *
 * searchRank puts the exact home first: the same unit at the same building.
 */

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9@.+]+/g, " ")
    .replace(/\b(flat|room|apartment|apt|unit|studio)(\d+[a-z]?)\b/g, "$1 $2")
    .split(" ")
    .map((w) => w.replace(/^[.+]+|[.]+$/g, ""))
    .filter(Boolean);
const digits = (s: string) => s.replace(/\D/g, "");

export function searchTokens(needle: string): string[] {
  return words(needle);
}

function tokenIn(token: string, haystack: string[]): boolean {
  if (/\d/.test(token)) return haystack.includes(token);
  return haystack.some((w) => w.startsWith(token));
}

/** Every word of the search appears in the record (any field, any order). */
export function searchMatches(needle: string, ...fields: (string | null | undefined)[]): boolean {
  const tokens = words(needle);
  if (!tokens.length) return false;
  const present = fields.filter((f): f is string => Boolean(f));
  const hay = present.flatMap((f) => words(String(f)));
  if (tokens.every((t) => tokenIn(t, hay))) return true;
  const nd = digits(needle);
  return nd.length >= 5 && /^[\d\s+()-]+$/.test(needle.trim()) && present.some((f) => digits(String(f)).includes(nd));
}

/**
 * 2 - the search names a unit and a building and this record is that door;
 * 1 - every word matches whole; 0 - a match on the start of a word.
 */
export function searchRank(needle: string, address: string | null | undefined): number {
  if (!address) return 0;
  const n = parseAddress(needle);
  const a = parseAddress(address);
  if (n.unit != null && n.building != null && sameDoor(n, a, true)) return 2;
  const hay = words(address);
  return words(needle).every((t) => hay.includes(t)) ? 1 : 0;
}
