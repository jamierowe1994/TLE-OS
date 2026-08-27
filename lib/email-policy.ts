/**
 * WHO THE TLE OS DOMAIN IS ALLOWED TO EMAIL.
 *
 * ── The rule, in James's words, 27 Aug 2026 ───────────────────────────────
 *
 * "This domain should only be sent to internal staff emails. If we're emailing
 * a lettings agent about something, whether that's a confirmation of password
 * or whatever, that is fine. If we're emailing externally, I need to set up a
 * different domain because we would need the official Lettings Experts domain
 * for that one."
 *
 * So the OS domain is an INTERNAL domain. Password confirmations, verification
 * links, invites, anything addressed to somebody who works here. A landlord or
 * a tenant must never receive mail from it.
 *
 * ── Why this is code and not a note in a document ─────────────────────────
 *
 * The public sending domain does not exist yet — it is a couple of days away.
 * Between now and then every send path in this codebase is one wrong `to:`
 * away from putting the internal domain in front of a client, and reputational
 * damage to a sending domain is not something you undo by apologising. A rule
 * that lives in a README is enforced by whoever remembers it at the time.
 *
 * The check therefore sits at the SEND PATH (lib/resend.ts), not at the call
 * sites. Call sites multiply; there is one place mail actually leaves.
 *
 * ── Fail closed ───────────────────────────────────────────────────────────
 *
 * An address we cannot classify is EXTERNAL. Not internal-by-default, not
 * "allow and log". The cost of wrongly refusing is a colleague not getting an
 * invite and telling us; the cost of wrongly allowing is a landlord receiving
 * mail from a domain that was never meant to talk to them.
 *
 * ── When the public domain arrives ────────────────────────────────────────
 *
 * Do NOT delete this. Add the second sender with its own `from`, and route by
 * AUDIENCE: internal mail keeps this domain and this guard, client mail goes
 * out on the Lettings Experts domain. The guard is what keeps them from
 * quietly becoming one thing again.
 */

/**
 * The domains that are us.
 *
 * TLE partners genuinely live on BOTH of the first two — measured while
 * building the REX agent filter, and assuming one domain silently lost half
 * the team. Kept here rather than in an env var alone so the list is
 * reviewable in a diff; `INTERNAL_EMAIL_DOMAINS` extends it for the other TEG
 * brands without a deploy.
 */
const BUILT_IN_INTERNAL = [
  "thelettingexperts.co.uk",
  "therecruitmentexperts.co.uk",
] as const;

export function internalDomains(): string[] {
  const extra = (process.env.INTERNAL_EMAIL_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
  return [...new Set([...BUILT_IN_INTERNAL, ...extra])];
}

/** The domain part, lower-cased. Null when the address is not one. */
function domainOf(email: string): string | null {
  const at = email.trim().toLowerCase().lastIndexOf("@");
  if (at < 1 || at === email.trim().length - 1) return null;
  return email.trim().toLowerCase().slice(at + 1);
}

/**
 * Is this one of ours?
 *
 * Exact domain match, never `endsWith`. `endsWith("thelettingexperts.co.uk")`
 * would also accept `nottheletttingexperts.co.uk` and, more plausibly,
 * anything an attacker registers ending in our name. Subdomains are not
 * accepted either: if we ever send as `mail.thelettingexperts.co.uk`, that
 * goes on the list deliberately.
 */
export function isInternalAddress(email: string): boolean {
  const d = domainOf(email);
  return d ? internalDomains().includes(d) : false;
}

export class ExternalRecipientRefused extends Error {}

/**
 * What to SAY to somebody typing a non-TEG address into a sign-up box.
 *
 * ── Why this one is safe to be loud about, when the rest stay silent ──────
 *
 * /verify/start and /reset/start answer identically whatever happens, because
 * a different answer per case turns the form into a staff directory: post an
 * address, watch the response, learn whether that person works here.
 *
 * The DOMAIN rule leaks none of that. "We only accept @thelettingexperts.co.uk"
 * is a policy, not a fact about any individual — it is the same answer for
 * every address on gmail.com, and it reveals nothing about who holds an
 * account. So it can be said out loud, and it should be: somebody typing their
 * personal address is making an honest mistake and deserves to be told, not
 * left refreshing an inbox.
 *
 * The silence stays exactly where it earns its keep — RIGHT domain, wrong
 * person. That is the case that would leak, and it still says nothing.
 */
export function wrongDomainMessage(email: string): string {
  const d = domainOf(email);
  const list = internalDomains().map((x) => `@${x}`).join(" or ");
  return (
    `That's ${d ? `an @${d}` : "not a work"} address — TLE OS only lets you in on a Lettings Experts one. ` +
    `Try your ${list} address instead. ` +
    `If you don't have one yet, that's a question for James rather than for this box.`
  );
}

/**
 * Refuse anything that is not a colleague.
 *
 * Throws rather than returning a boolean, so a caller cannot forget to check
 * the answer — the failure mode of a boolean here is a silent send.
 */
export function assertInternalRecipient(email: string): void {
  if (isInternalAddress(email)) return;
  const d = domainOf(email);
  throw new ExternalRecipientRefused(
    `The TLE OS domain only emails internal staff, and ${d ? `@${d}` : "that address"} isn't one of ours (${internalDomains().map((x) => `@${x}`).join(", ")}). ` +
      `Client-facing email needs the public Lettings Experts sending domain, which isn't set up yet. ` +
      `If this address really is a colleague, add its domain to INTERNAL_EMAIL_DOMAINS.`
  );
}

/**
 * The people who may hold the keys, until there is a proper invite flow.
 *
 * James and Susan only — his instruction, 27 Aug. Anyone else who reaches the
 * registration page is refused by address, so a leaked access code is not
 * enough on its own to create an owner account.
 *
 * NOTE: nobody's password is ever set from here, or known to anyone but them.
 * These addresses receive a confirmation link and choose their own.
 */
export const FOUNDING_OWNERS = [
  "james@therecruitmentexperts.co.uk",
  "susan@thelettingexperts.co.uk",
] as const;

export function isFoundingOwner(email: string): boolean {
  return (FOUNDING_OWNERS as readonly string[]).includes(email.trim().toLowerCase());
}
