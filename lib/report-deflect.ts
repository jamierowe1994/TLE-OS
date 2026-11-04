/**
 * PUT IT RIGHT YOURSELF (James, 4 Nov 2026).
 *
 * Of the 173 reports agents sent in the first three weeks, nearly half were
 * things they could have done themselves: a detail wrong or missing on a
 * record, a figure that "won't change", a how-do-I. Edit has been on every
 * listing, let and home since 2 Nov and had been saved five times. So the
 * report form reads what is being typed and, when it is one of those, says
 * so before the report goes:
 *
 *  - On a listing, a let or a home, something wrong, missing, not pulled
 *    through or that "can't be changed": Edit on this record, and Steve's
 *    guide (lib/steve-guide, the edit.* routes) points at the Edit that
 *    changes it.
 *  - A how-do-I, on any screen: Steve answers it first, in his chat.
 *
 * Either way the report can still go - "Send it to James anyway" is always
 * one press away. Read off the words in the browser, like HelpDock's heard():
 * instant, free, and a wrong guess costs one press, never a lost report.
 *
 * Pure, so the patterns can be run over old reports to see what they catch.
 * Reports are typed fast: apostrophes are optional throughout ("cant",
 * "isnt", "wont").
 */

export type RecordKind = "listing" | "let" | "home";

/** Which record a page is, or null. The pages at /listings/<id>,
 *  /applications/<id> and /portfolio/<id>; not the boards, and not the
 *  fixed screens that share those folders. */
const NOT_RECORDS = new Set(["flatfair", "right-to-rent", "updates", "home", "take-on"]);
export function recordOn(path: string): RecordKind | null {
  const m = /^\/(listings|applications|portfolio)\/([^/?#]+)\/?$/.exec(path);
  if (!m || NOT_RECORDS.has(m[2])) return null;
  return m[1] === "listings" ? "listing" : m[1] === "applications" ? "let" : "home";
}

/* ── Something on the record is wrong ──────────────────────────────────── */

const NOT = String.raw`(?:not|never|no longer|is ?n'?t|are ?n'?t|was ?n'?t|does ?n'?t|do ?n'?t|did ?n'?t|has ?n'?t|have ?n'?t|wo ?n'?t|wont|cant|can'?t)`;
const CHANGE = String.raw`(?:change|edit|amend|update|correct)`;

const WRONG = new RegExp(
  [
    String.raw`\b(?:wrong|incorrect|inaccurate|out of date|outdated|typo|mis-?spel(?:t|led))\b`,
    String.raw`\b(?:not|is ?n'?t|are ?n'?t|was ?n'?t) (?:the )?(?:right|correct)\b`,
    String.raw`\bshould (?:be|say|read|show|have been)\b`,
    String.raw`\b(?:missing|blank)\b`,
    /* It never arrived: not showing, didn't come over, not pulling through. */
    String.raw`\b${NOT} (?:\w+ )?(?:show(?:s|ing|n)?|appear(?:s|ing|ed)?|there|in there|on there|pull(?:s|ing|ed)?|pulled|carr(?:y|ies|ied|ying)|com(?:e|es|ing) (?:over|through|across)|came (?:over|through|across)|go(?:es|ing)? (?:through|across)|push(?:es|ed|ing)?)\b`,
    String.raw`\b(?:there'?s|there is|theres|it has|has got) no (?:\w+ )?(?:landlord|tenant|applicant|owner|address|e-?mail|mobile|phone|number|deposit|rent|move[- ]?in|start date)s?\b`,
    /* It won't take a change, or there's nowhere to make it. */
    String.raw`\b(?:${NOT}|cannot|can not|unable to|not able to|no way to|no option to|nowhere to|no where to|no place to|(?:wo ?n'?t|wont|does ?n'?t|will not) let (?:me|us)) (?:seem to |be able to )?(?:${CHANGE}|fix|add|remove|enter|put in|select)\b`,
    String.raw`\b(?:does ?n'?t|do ?n'?t|does not|did ?n'?t) (?:seem to )?(?:be|have) (?:an?|any) (?:option|way|place|button|field|box)\b`,
    String.raw`\b(?:there'?s|there is|theres) no (?:option|way|place|button|field|box|where) to\b`,
    String.raw`\b${NOT} sav(?:e|es|ed|ing)\b`,
    /* Asking for the power they already have. */
    String.raw`\b(?:need|needs|want|wants|have) to (?:be able to )?(?:${CHANGE}|remove)\b`,
    String.raw`\ballows? (?:me|us) to ${CHANGE}\b`,
    String.raw`\b(?:how|where) (?:do|can|could|would) (?:i|we|you) (?:${CHANGE}|fix)\b`,
    String.raw`\bhow can (?:it|this|that|they|these) be (?:changed|edited|amended|updated|corrected)\b`,
  ].join("|"),
  "i"
);

/* Wrong, but not something an Edit puts right: what the OS sent or keeps
   sending, a home missing from a board or a portal, bank details (never on
   a record, by James's decision). These go to James as they are. */
const NOT_AN_EDIT =
  /\b(?:bank|sort code|account (?:number|details))\b|\b(?:keeps?|kept) (?:on )?(?:emailing|sending|texting|messaging|calling|ringing)\b|\b(?:emailing|emailed|texting|texted|messaging) (?:him|her|them|the (?:tenant|landlord|applicant|contractor)s?)\b|\bsending out\b|\b(?:showing|shown|show|shows|appear(?:s|ing)?|coming up) (?:up )?(?:in|on) (?:my|the|our) (?:portfolio|board|list|listings|leads|diary|calendar|dashboard|app|phone|rightmove|zoopla|onthemarket|portals?)\b/i;

/**
 * What the words are about. A report has to name something an Edit can
 * change before the offer is made, so "the page is blank" is never told to
 * press Edit. Tried in this order and the first that matches wins: "the
 * tenant's move-in date" is the move-in, "LL 2's reg number" is the
 * registration, and "managed, not let only" is the service.
 */
export type Topic = "dates" | "money" | "service" | "tenant" | "registration" | "landlord" | "address" | "details" | "advert" | "contact";
const TOPICS: { topic: Topic; words: RegExp }[] = [
  { topic: "dates", words: /\b(?:move[- ]?in|moving in|start(?:s|ing)? date|tenancy (?:start|end|length|term)|end date|available (?:date|from))\b/i },
  { topic: "money", words: /\b(?:deposit|holding (?:fee|deposit)|rent(?! collect)|price|asking)\b/i },
  /* "Managed" on its own describes the home ("the tenant on this managed
     home"); it is the service only when it is what the home is or isn't. */
  { topic: "service", words: /\b(?:service(?: level| type)?|let[- ]only|fully managed|rent collect(?:ion|ed)?|tenant find|management (?:status|type|level|service)|under management|(?:is|as|be|now|not|no longer|is ?n'?t) (?:\w+ )?managed)\b/i },
  { topic: "tenant", words: /\b(?:tenants?|applicants?|occupiers?|guarantors?)\b/i },
  /* The landlord's, not a company's ("Companies House registration"). */
  { topic: "registration", words: /\b(?:(?:landlord|LL) reg(?:istration)?|reg(?:istration)? (?:numbers?|nos?|expiry)|LARN)\b/i },
  { topic: "landlord", words: /\b(?:landlords?|LLs?|owners?|co-?owners?|partner|company name)\b/i },
  { topic: "address", words: /\b(?:address(?:es)?|postcode|flat number|house number)\b/i },
  { topic: "details", words: /\b(?:bed(?:room)?s?|bath(?:room)?s?|council tax|furnish(?:ed|ing)?|type of (?:let|home|property)|property type)\b/i },
  { topic: "advert", words: /\b(?:EPC|energy rating|rating|description|advert|photos?|pictures?|floor ?plans?|write-?up)\b/i },
  /* A name, number or email on its own: whoever the record's person is. */
  { topic: "contact", words: /\b(?:e-?mails?|mobiles?|phones?|numbers?|names?|spelling|contact details|details|DOB|date of birth)\b/i },
];

/** The Edit that changes each topic on each record: a GUIDE_TARGETS id. A
 *  topic a record has no Edit for gets no offer there (a let's address is
 *  the home's, a home's rent is PayProp's). */
export const EDIT_TARGETS: Record<RecordKind, Partial<Record<Topic, string>>> = {
  let: {
    dates: "edit.let-deal",
    money: "edit.let-deal",
    tenant: "edit.let-tenant",
    contact: "edit.let-tenant",
    landlord: "edit.let-landlord",
  },
  home: {
    dates: "edit.home-details",
    service: "edit.home-details",
    details: "edit.home-details",
    tenant: "edit.home-tenant",
    contact: "edit.home-tenant",
    landlord: "edit.home-landlord",
    address: "edit.address",
  },
  listing: {
    dates: "edit.listing-details",
    money: "edit.listing-details",
    service: "edit.listing-details",
    details: "edit.listing-details",
    landlord: "edit.listing-landlord",
    contact: "edit.listing-landlord",
    registration: "edit.listing-registration",
    address: "edit.address",
    advert: "edit.listing-advert",
  },
};

/** What each Edit changes, as the report form says it. */
export const EDIT_SAYS: Record<string, string> = {
  "edit.let-deal": "Edit on The Deal changes the move-in date, deposit, rent, holding fee and tenancy length.",
  "edit.let-tenant": "Edit on the tenant, under People, changes their name, mobile and email.",
  "edit.let-landlord": "The landlords are under People: click a name, mobile or email to change it, or add another landlord.",
  "edit.listing-details": "Edit on The Details changes the rent, deposit, available date, bedrooms, bathrooms, council tax, furnishing and service.",
  "edit.listing-landlord": "Edit on the Landlord changes their details, adds another landlord or a contact, or changes the landlord.",
  "edit.listing-registration": "Landlord registration, under the landlord, takes each landlord's number and when it runs out.",
  "edit.listing-advert": "Edit the advert changes the description, photos, EPC and everything the portals show.",
  "edit.home-details": "Edit on The Details changes the service, the type of home, the tenancy dates, the gas supply and who lives here.",
  "edit.home-tenant": "Edit on the tenant changes their mobile, email and name.",
  "edit.home-landlord": "The Landlords card changes their details, adds another landlord, or changes the landlord.",
  "edit.address": "Change address puts the right address on the listing, the home and the portals.",
};

/* ── A question Steve can answer ───────────────────────────────────────── */

const HOW_TO = new RegExp(
  [
    String.raw`\bhow (?:do|can|should|would|could|does) (?:i|we|you|one|it|this)\b`,
    String.raw`\bhow to\b`,
    String.raw`\bwhere (?:do|can|should|would) (?:i|we)\b`,
    String.raw`\bwhere(?:'?s| is| are)\b`,
    String.raw`\b(?:is|are) there (?:a |an |any )?(?:way|option|button|place|setting|tab|screen)s?\b`,
    String.raw`\bis it possible\b`,
    String.raw`\bwhat do (?:i|we) (?:do|press|click)\b`,
    String.raw`\bdo (?:i|we) (?:need|have) to\b`,
    String.raw`\b(?:can|could) i\b[^.?!]*\?`,
    /* "Can we have a filter...?" is an idea for James, not a question for
       Steve; "can we not edit it from here?" is a question. */
    String.raw`\b(?:can|could) we\b(?!\s+(?:please\s+|pls\s+)?(?:have|get|add|put|integrate|include|make|create|build)\b)(?![^.?!]*\b(?:please|pls|plz)\b)[^.?!]*\?`,
  ].join("|"),
  "i"
);

/* They have asked him already, and are telling James what he said. */
const ASKED_HIM = /\b(?:asked|ask(?:ing)?) (?:steve|hamish)\b|\b(?:steve|hamish) (?:says|said|is saying|told|tells|thinks)\b/i;

export type Deflection =
  /** Edit on this record: `guide` is the GUIDE_TARGETS route to its Edit. */
  | { kind: "edit"; record: RecordKind; topic: Topic; guide: string }
  /** A question: Steve answers it first. */
  | { kind: "ask" }
  | null;

/**
 * What to offer for these words on this page, or null for a plain report.
 * `canReach` says whether a route's Edit is on this screen for this person
 * (lib/steve-guide guideReachable); without it every Edit counts as there.
 */
export function deflectionFor(text: string, path: string, canReach: (guide: string) => boolean = () => true): Deflection {
  const words = text.trim();
  if (words.length < 8) return null;
  const record = recordOn(path);
  if (record && WRONG.test(words) && !NOT_AN_EDIT.test(words)) {
    const topic = TOPICS.find((t) => t.words.test(words))?.topic;
    const guide = topic ? EDIT_TARGETS[record][topic] : undefined;
    if (topic && guide && canReach(guide)) return { kind: "edit", record, topic, guide };
  }
  return HOW_TO.test(words) && !ASKED_HIM.test(words) ? { kind: "ask" } : null;
}
