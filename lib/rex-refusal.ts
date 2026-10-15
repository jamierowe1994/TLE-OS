/**
 * A REX refusal, in words an agent can act on (15 Oct 2026).
 *
 * The listing writes used to answer every refusal with "Try again in a
 * minute" or "Check the details" - and a refused field is refused every time,
 * so the agent tried again, lost the advert, and a ticket came in instead
 * (bf3ba4c2: the EPC's date; 9ad8cc4f: the property's Source). The ones we
 * know get a sentence of their own. Any other validation refusal is passed on
 * with REX's housekeeping taken out, because its own sentence ("Please select
 * a ...") still says what is missing better than a guess. Agent screens never
 * say REX, so neither does anything here.
 */

const KNOWN: [RegExp, string][] = [
  [/epc lodgement date/i, "The EPC scores need the date on the EPC. Add it under EPC and save again."],
  [/select a source/i, "This home has no Source yet - how the landlord came to us. Ask the office to add it, then try again."],
];

export function refusalInWords(error: string | null | undefined, fallback: string): string {
  const raw = String(error ?? "");
  for (const [test, words] of KNOWN) if (test.test(raw)) return words;
  if (!/validation/i.test(raw)) return `${fallback} Try again in a minute.`;
  const said = raw
    .replace(/\s*\(\w*Exception\)\s*$/, "")
    .replace(/\s*Value provided:.*$/i, "")
    .replace(/\s*You can find this field under[^.]*\.?/i, "")
    .replace(/\bREX\b/g, "the listings system")
    .trim();
  return said ? `${fallback} It was turned down: ${said.replace(/\.?$/, ".")}` : `${fallback} Try again in a minute.`;
}
