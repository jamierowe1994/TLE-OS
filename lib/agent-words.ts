/**
 * What an agent may read in an error.
 *
 * Agents never see the name of the system behind the listings, a supplier, an
 * env var or the switches page (17 Sep 2026). Owners keep the technical words,
 * because James needs them to unlock things.
 */

type Who = { role: string } | null | undefined;

const TECHNICAL = /\bREX\b|ALLOW_WRITES|_API_|Admin\s*[→>-]\s*Switches|Anthropic|Propoly|PayProp|DocuSeal/i;

/** James and Susan: the people who may read the wiring. */
export function isOwner(who: Who): boolean {
  return who?.role === "owner" || who?.role === "super_admin";
}

/**
 * A message that came from somewhere else (e.message, a supplier's answer),
 * made safe to show. Owners get it as it is; anyone else gets `fallback` when
 * it names anything technical.
 */
export function forAgent(who: Who, message: string, fallback: string): string {
  if (isOwner(who)) return message;
  return TECHNICAL.test(message) ? fallback : message;
}
