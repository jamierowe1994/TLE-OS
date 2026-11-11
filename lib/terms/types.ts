/**
 * THE TERMS OF BUSINESS AS DATA (James, 23 Oct 2026).
 *
 * "Rather than this being a PDF that they sign and we overlay, what I actually
 * prefer is for us to actually take this contract and write it down on the
 * site that they open... If it's England or Scotland, we can swap them around
 * really easily."
 *
 * So each contract is one of these: sections of plain words with a few
 * structured blocks where the contract carries details, fees or signatures.
 * One renderer turns it into the page the landlord reads (components/terms)
 * and another into the HTML DocuSeal signs (lib/terms/render-html), so what a
 * landlord reads and what they sign can never be two different documents.
 *
 * Placeholders in text are {{name}} and are filled from TermsValues. Text may
 * carry <strong> and <em> and nothing else.
 */

export type Country = "scotland" | "england";

/** Filled into {{...}} in the words. Everything here is known when the agent sends. */
export interface TermsValues {
  agentName: string;
  /** The partner agent's own LARN (Scotland). */
  agentLarn: string;
  propertyAddress: string;
  /** The service the landlord is taking, as the contract words it. */
  serviceLevel: string;
  setUpFee: string;
  managementFee: string;
  additionalFees: string;
  /** "24 October 2026": the day the agent sends. */
  dateIssued: string;
}

/** What each landlord tells us about themselves before they sign. */
export interface LandlordDetails {
  name: string;
  email: string;
  phone: string;
  address: string;
  /** Scotland: the council's landlord registration number and its expiry. */
  registrationNumber: string;
  registrationExpiry: string;
  bankAccountName: string;
  bankName: string;
  sortCode: string;
  /** Sealed at rest (lib/bank-vault); a browser only ever gets the last four. */
  accountNumber: string;
  /**
   * England's PRS Database rental property number (November 2026): the
   * property's own, so asked of the first landlord only.
   */
  rentalPropertyNumber: string;
  /** The Landlord Declarations (November 2026), each "yes" or "no". */
  noGas: string;
  /** Their own usual home is outside the UK: asked of each landlord about themselves. */
  nonUk: string;
  /** Selective, additional or mandatory licensing, or an HMO licence (Scotland: an HMO licence). */
  licensing: string;
}

/** The detail boxes a contract asks each landlord for, in the order asked. */
export interface DetailField {
  key: keyof LandlordDetails;
  label: string;
  /** Shown under the box while they fill it in. */
  hint?: string;
  required: boolean;
  kind?: "text" | "email" | "tel" | "date" | "sortcode" | "account" | "yesno";
  /** The step of the form it belongs to. */
  step: "you" | "registration" | "bank" | "declarations";
  /**
   * The home's, not the person's (the bank account rent goes to, no gas, the
   * licence): asked of the first landlord only and printed once, as the
   * contract prints it (November 2026 editions).
   */
  firstOnly?: boolean;
  /**
   * Only ever the landlord's to give (James, 5 Nov 2026: "we need a
   * confirmation if there is no gas... always has to be the landlord"). The
   * agent's screen shows it as theirs and never offers to fill it in.
   */
  landlordOnly?: boolean;
  /** kind "yesno": the question as asked, and what each answer prints on the contract. */
  ask?: string;
  printYes?: string;
  printNo?: string;
  /**
   * Not asked as a detail: it follows an answer about the home
   * (lib/property-questions), "yes" when that answer is one of `yes`. No gas
   * at the property is the landlord's answer on the Gas screen, asked once.
   */
  fromAnswer?: { id: string; yes: string[] };
}

export type Block =
  /** A paragraph. */
  | { kind: "p"; text: string }
  /** A bulleted list. */
  | { kind: "list"; items: string[] }
  /** A small heading inside a section ("Letting & Full Management (Managed)"). */
  | { kind: "h"; text: string }
  /** Label and value rows, values from TermsValues: the agreement's front page. */
  | { kind: "facts"; rows: Array<{ label: string; value: string }> }
  /**
   * Each landlord's own details, one card per landlord, from LandlordDetails.
   * `first`: the home's details the first landlord gives (the bank account,
   * the declarations), printed once.
   */
  | { kind: "landlords"; fields: Array<keyof LandlordDetails>; first?: boolean }
  /** The service and fees chosen for this home. */
  | { kind: "fees" }
  /** A table of what each service level includes. */
  | { kind: "table"; head: string[]; rows: string[][] }
  /** Where everybody signs: every landlord, then the agent. */
  | { kind: "signatures" }
  /** The request to start during the cancellation period: each landlord ticks and signs. */
  | { kind: "waiver"; text: string };

export interface Section {
  /** "1", "2"... as the contract numbers them; absent for unnumbered parts. */
  n?: string;
  title: string;
  blocks: Block[];
}

export interface TermsDoc {
  /** Stable: stored on every contract sent, so a later edit never rewrites a signed one. */
  id: string;
  country: Country;
  /** "Landlord Agency Agreement & Terms of Business" */
  title: string;
  /** "Scotland" */
  subtitle: string;
  /** Which version of the wording, said on the page: "October 2026". */
  edition: string;
  /** The detail boxes this contract asks each landlord to fill in. */
  details: DetailField[];
  /**
   * The questions about the home come before the contract (James, 5 Nov 2026:
   * "these pre-populated questions should always go before the contract").
   * November 2026 on; earlier editions go straight to the contract.
   */
  asksFirst?: boolean;
  sections: Section[];
}
