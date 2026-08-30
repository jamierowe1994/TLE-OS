/**
 * Names, written the way a person would write them.
 *
 * Leads arrive from portals, forms and typing, so casing is whatever the
 * sender felt like: "james rowe", "JAMES ROWE", "james.rowe". None of that
 * should reach a landlord in an email that opens "Hi james,".
 *
 * Not server-only: the composer needs this in the browser too.
 */

/** Segments that keep their own shape rather than being title-cased. */
const PARTICLES = new Set(["de", "del", "della", "der", "van", "von", "la", "le", "du", "da"]);

function capSegment(seg: string): string {
  if (!seg) return seg;
  const lower = seg.toLowerCase();

  /* Mc and Mac take a second capital — McDonald, MacLeod. Guarded on length
     so "Mac" itself, and "Mace", are left alone. */
  if (/^mc[a-z]{2,}$/.test(lower)) return "Mc" + lower[2].toUpperCase() + lower.slice(3);
  if (/^mac[a-z]{3,}$/.test(lower)) return "Mac" + lower[3].toUpperCase() + lower.slice(4);

  /* O'Brien, D'Angelo — the letter after the apostrophe is a capital. */
  if (/^[od]'[a-z]+$/.test(lower)) return lower[0].toUpperCase() + "'" + lower[2].toUpperCase() + lower.slice(3);

  return lower[0].toUpperCase() + lower.slice(1);
}

/**
 * "james rowe" → "James Rowe". "SMITH-JONES" → "Smith-Jones".
 *
 * Hyphens and apostrophes are separators AND are kept, so a double-barrelled
 * surname survives intact. Particles stay lowercase unless they lead.
 */
export function properName(raw: string): string {
  const s = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!s) return "";
  return s
    .split(" ")
    .map((word, wi) =>
      word
        .split(/([-'])/)
        .map((part, i) => {
          if (part === "-" || part === "'") return part;
          if (wi > 0 && i === 0 && PARTICLES.has(part.toLowerCase())) return part.toLowerCase();
          return capSegment(part);
        })
        .join("")
    )
    .join(" ");
}

/** Just the first name, properly cased. */
export function firstNameOf(raw: string): string {
  return properName(raw).split(" ")[0] ?? "";
}

/**
 * The agent's name, even when the field holds their email.
 *
 * MEASURED 30 Aug: a lead's `agent` sometimes carries an address rather than a
 * name, so the composer signed a landlord email off as
 * "james@therecruitmentexperts.co.uk". Nobody signs a letter with their inbox.
 *
 * The local part is the best available guess: separators become spaces, pure
 * digits go (jamie.rowe.1994 is not called 1994), and what is left is cased
 * like a name. If nothing survives, "" — and the composer will refuse to send
 * on an unresolved {{agent}} rather than sign off with a blank.
 */
export function agentName(raw: string): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  if (!s.includes("@")) return properName(s);
  const local = s.split("@")[0];
  const words = local
    .split(/[._\-+]+/)
    .filter((w) => w && !/^\d+$/.test(w))
    .map(capSegment);
  return words.join(" ");
}
