/**
 * A Scottish landlord registration number is per person, so a home owned by
 * two people carries two (Lianna Denholm, 28 Oct 2026: "What if they have two
 * separate ones?"). They are kept as one value, separated by commas, so every
 * reader that wanted one number still has a string; these split and join it.
 */

/** The most a home is given room for: joint owners, rarely more than two. */
export const MAX_REG_NUMBERS = 4;

/** "123/230/1, 456/230/2" -> ["123/230/1", "456/230/2"]. */
export function regNumbers(value: string | null | undefined): string[] {
  return (value ?? "").split(/[,;\n]+/).map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean);
}

/** The numbers as they are kept and written on the advert. */
export function joinRegNumbers(list: string[]): string | null {
  const kept = list.map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean);
  return kept.length ? kept.join(", ") : null;
}

/** "123/230/1" or "123/230/1 and 456/230/2", for a sentence. */
export function regNumbersInWords(value: string | null | undefined): string {
  const list = regNumbers(value);
  return list.length > 1 ? `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}` : list[0] ?? "";
}
