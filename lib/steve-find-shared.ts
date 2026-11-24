/**
 * STEVE FINDS WHAT'S MISSING (James, 24 Nov 2026). Client-safe: no imports
 * beyond the report form's own reading of the words.
 *
 * "Landlord details missing", "no tenant on this home", "tenant's email isn't
 * there": the commonest small ticket, and James was putting each one right by
 * hand from PayProp, Propoly or REX, where the details already were. Now the
 * report form offers "Let Steve find it" first. He looks in those places, shows
 * what he found and where, and asks "Is this the right person?". The agent
 * cannot type or change any of it - they say yes or no:
 *
 *   yes      it is saved in the OS (blanks only, never over something already
 *            there, logged with who said yes) and no ticket is made
 *   no       the report goes to James with what Steve found and that it was
 *            turned down, so he doesn't look again
 *   nothing  the report goes to James saying where Steve looked
 *
 * Only a home on the person's own book, except for the people James named
 * (Michael and Kirstie) and anyone who can open Admin. Checked on the server.
 *
 * Nothing is ever written to REX, PayProp or Propoly.
 */

import { recordOn, type RecordKind } from "@/lib/report-deflect";

export type FindWho = "landlord" | "tenant";
export type FindSource = "payprop" | "propoly" | "rex" | "record" | "os";

/** Where it was found, as an agent reads it. Agent screens never say REX. */
export const SOURCE_SAYS: Record<FindSource, string> = {
  payprop: "PayProp",
  propoly: "Propoly",
  rex: "the home's file",
  record: "the home's own record",
  os: "the OS",
};

/** The same, for James's list, where REX can be named. */
export const SOURCE_ADMIN: Record<FindSource, string> = { ...SOURCE_SAYS, rex: "REX" };

export type FoundPerson = {
  who: FindWho;
  name: string;
  email: string | null;
  phone: string | null;
  /** What saying yes adds: the parts that were blank. */
  adds: Array<"name" | "email" | "phone">;
  source: FindSource;
};

export type FindAnswer =
  /** Something to confirm. `token` carries it sealed, so the browser can't change it. */
  | { state: "found"; home: string; people: FoundPerson[]; token: string; looked: string[] }
  /** Steve looked and found nothing he can be sure of. */
  | { state: "none"; home: string; looked: string[]; why: string }
  /** Nothing is blank on this record. */
  | { state: "complete"; home: string }
  /** Not on their book (and not one of the people who may fix any home). */
  | { state: "not-yours" }
  | { state: "error"; error: string };

/** What a report carries to James when Steve's find didn't settle it. */
export type FindOutcome = {
  said: "no" | "nothing";
  looked: string[];
  found?: Array<Pick<FoundPerson, "who" | "name" | "email" | "phone" | "source">>;
};

/* The words: something is missing, blank, never came over. Not "wrong" -
   a wrong detail is Edit's, a missing one is Steve's to find. */
const NOT = String.raw`(?:not|never|no longer|is ?n'?t|are ?n'?t|was ?n'?t|does ?n'?t|do ?n'?t|did ?n'?t|has ?n'?t|have ?n'?t|wo ?n'?t|wont|cant|can'?t)`;
const MISSING = new RegExp(
  [
    String.raw`\b(?:missing|blank|empty)\b`,
    String.raw`\b${NOT} (?:\w+ )?(?:show(?:s|ing|n)?|appear(?:s|ing|ed)?|there|in there|on there|pull(?:s|ing|ed)?|pulled|carr(?:y|ies|ied|ying)|com(?:e|es|ing) (?:over|through|across)|came (?:over|through|across)|go(?:es|ing)? (?:through|across))\b`,
    String.raw`\b(?:there'?s|there is|theres|it has|has got|have got|we have|i have|with) no (?:\w+ )?(?:landlord|tenant|owner|e-?mail|mobile|phone|number|contact|details?)s?\b`,
    String.raw`\bno (?:landlord|tenant|owner)s?(?:'s)? (?:details?|info(?:rmation)?|contact|e-?mail|mobile|phone|number|name)s?\b`,
    String.raw`\b(?:no|without) (?:contact )?details\b`,
  ].join("|"),
  "i"
);
const LANDLORD = /\b(?:landlords?|LLs?|owners?|co-?owners?)\b/i;
const TENANT = /\b(?:tenants?|occupiers?)\b/i;
const CONTACT = /\b(?:e-?mails?|mobiles?|phones?|numbers?|names?|contact details|details|info(?:rmation)?)\b/i;
/* Things Steve doesn't fill: certificates, money, papers, bank details. */
const NOT_PEOPLE = /\b(?:bank|sort code|account (?:number|details)|cert(?:ificate)?s?|EICR|gas safe(?:ty)?|EPC|deposit|rent|invoice|lease|tenancy agreement|photos?|keys?|reference)\b/i;

/** The report form asks this: is it a missing person Steve can look for, here? */
export function findableFor(text: string, path: string): { record: RecordKind; who: FindWho | null } | null {
  const words = text.trim();
  if (words.length < 8) return null;
  const record = recordOn(path);
  /* A let's people are Propoly's and the let page's: not yet. */
  if (!record || record === "let") return null;
  if (!MISSING.test(words) || NOT_PEOPLE.test(words)) return null;
  const landlord = LANDLORD.test(words);
  const tenant = TENANT.test(words);
  /* A listing's landlord only: its tenants are applicants, not people we hold. */
  if (record === "listing") return landlord ? { record, who: "landlord" } : null;
  if (landlord && !tenant) return { record, who: "landlord" };
  if (tenant && !landlord) return { record, who: "tenant" };
  if (landlord || tenant || CONTACT.test(words)) return { record, who: null };
  return null;
}

export function sayPerson(p: Pick<FoundPerson, "who" | "name">): string {
  return `${p.who === "landlord" ? "Landlord" : "Tenant"}: ${p.name}`;
}
