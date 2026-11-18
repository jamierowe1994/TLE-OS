/**
 * What stops a listing going to the portals, in words an agent can act on
 * (James, 18 Nov 2026, a home of Tony Poon's).
 *
 * The publish read (app/api/listings/publish GET) passes on the listings
 * system's own checks as it words them: "A primary listing agent must be
 * specified". The button used to say only "Not until the portals' own checks
 * pass", so Tony Poon had a 6 of 6 advert that would not go and nobody could
 * say why. Each known check becomes one sentence, a "Not until ..." phrase and
 * the place to fix it. Two messages about the same thing (REX sends two for a
 * missing agent) become one.
 *
 * Client-safe: no server imports. Behind the "portalwhy" switch.
 */

/** Where the fix is: the listing's agent, or a step of Edit the Advert. */
export type BlockerFix = "agent" | "home" | "let" | "bills" | "epc" | "advert" | "photos";

export type PortalBlock = {
  key: string;
  /** A sentence for the list: "No agent is named on this listing." */
  says: string;
  /** For "Not until ...": "an agent is named on this listing". */
  until: string;
  fix: BlockerFix | null;
};

const RULES: { test: RegExp; key: string; says: string; until: string; fix: BlockerFix | null }[] = [
  { test: /listing agent/i, key: "agent", says: "No agent is named on this listing.", until: "an agent is named on this listing", fix: "agent" },
  { test: /bedroom/i, key: "beds", says: "The number of bedrooms is missing.", until: "the bedrooms are filled in", fix: "home" },
  { test: /bathroom/i, key: "baths", says: "The number of bathrooms is missing.", until: "the bathrooms are filled in", fix: "home" },
  { test: /sub.?category|property type|category/i, key: "type", says: "The property type is missing.", until: "the property type is picked", fix: "home" },
  { test: /avail/i, key: "available", says: "The date it's available from is missing.", until: "the available date is filled in", fix: "let" },
  { test: /\b(price|rent)\b/i, key: "rent", says: "The rent is missing.", until: "the rent is filled in", fix: "let" },
  { test: /bond|deposit/i, key: "deposit", says: "The deposit is missing.", until: "the deposit is filled in", fix: "let" },
  { test: /council tax/i, key: "council", says: "The council tax band is missing.", until: "the council tax band is picked", fix: "bills" },
  { test: /\bepc\b|energy/i, key: "epc", says: "The EPC is missing.", until: "the EPC is filled in", fix: "epc" },
  { test: /image|photo/i, key: "photos", says: "The advert needs photos.", until: "the photos are in", fix: "photos" },
  { test: /heading|headline|title/i, key: "heading", says: "The advert's heading is missing.", until: "the advert has a heading", fix: "advert" },
  { test: /description|body|advert text/i, key: "body", says: "The advert's description is missing.", until: "the advert has a description", fix: "advert" },
];

/** The words the publish read uses for a check it may not show an agent. */
const HIDDEN = /^One of the portal checks has not passed yet\.?$/i;

export function explainBlocker(message: string): PortalBlock {
  const m = message.trim();
  const rule = RULES.find((r) => r.test.test(m));
  if (rule) return { key: rule.key, says: rule.says, until: rule.until, fix: rule.fix };
  if (HIDDEN.test(m)) {
    return { key: "hidden", says: "One of the portals' checks hasn't passed, and it isn't one the OS can name. Tell James.", until: "James clears one of the portals' checks", fix: null };
  }
  /* A check this list doesn't know yet: shown as the system worded it. */
  const says = /[.!?]$/.test(m) ? m : `${m}.`;
  return { key: `raw:${m.toLowerCase()}`, says, until: "the portals' own checks pass", fix: null };
}

export function explainBlockers(messages: readonly string[]): PortalBlock[] {
  const seen = new Set<string>();
  const out: PortalBlock[] = [];
  for (const m of messages) {
    const b = explainBlocker(m);
    if (seen.has(b.key)) continue;
    seen.add(b.key);
    out.push(b);
  }
  return out;
}
