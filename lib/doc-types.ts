/**
 * THE DOCUMENT TYPES ON A FILE (James, 5 Oct 2026) - Kirstie's list, read off
 * what the office records on a tenancy today, plus Other with a name of the
 * uploader's own. Client-safe: the uploader shows them, the server checks them.
 *
 * `side` only orders and filters the list (a tenant lead has no use for the
 * landlord's proof of ownership); every type can go on any file.
 */

export type DocSide = "tenant" | "landlord" | "home";

export interface DocType {
  key: string;
  label: string;
  side: DocSide;
  /** Only asked for when the let has a guarantor (see hasGuarantorPapers). */
  guarantor?: boolean;
  /** Kept once by the office and on every home it applies to by itself
   *  (lib/standing-documents), so it is never offered as an upload on a let. */
  standing?: boolean;
}

export const DOC_TYPES: DocType[] = [
  { key: "holding_deposit_guide", label: "Holding Deposit Guide Signed", side: "tenant" },
  { key: "reference", label: "Reference", side: "tenant" },
  { key: "tenant_right_to_rent", label: "Tenant Right to Rent", side: "tenant" },
  { key: "tenant_proof_of_address", label: "Tenant Proof of Address", side: "tenant" },
  /* Kirstie Mulholland, 21 Oct 2026: "Please can you add Guarantor AML checks
     to documents." She and Lianna had been filing them as Other ("Gtor AML",
     "Guarantor AML 1"), with the guarantor's ID, reference and agreement
     beside them. Each goes into the PLC pack's Guarantor checks. */
  { key: "guarantor_aml", label: "Guarantor AML Check", side: "tenant", guarantor: true },
  { key: "guarantor_id", label: "Guarantor ID", side: "tenant", guarantor: true },
  { key: "guarantor_reference", label: "Guarantor Reference", side: "tenant", guarantor: true },
  { key: "guarantor_agreement", label: "Guarantor Agreement", side: "tenant", guarantor: true },
  /* Michael Healy and Lianna Denholm, 29 Oct 2026: the Easy Read Notes go to
     every Scottish tenant before the lease is signed, and it is the same
     document for every home. They were dropping it on each let as Other
     ("statutory notes"). Now the office uploads it once (Admin > Standing
     documents) and it is on every Scottish let by itself. */
  { key: "easy_read_notes", label: "Easy Read Notes", side: "tenant", standing: true },
  { key: "terms_of_business", label: "Terms of Business", side: "landlord" },
  { key: "landlord_id", label: "Landlord ID", side: "landlord" },
  { key: "landlord_proof_of_ownership", label: "Landlord Proof of Ownership", side: "landlord" },
  { key: "landlord_aml", label: "Landlord AML Check", side: "landlord" },
  /* A company or an estate as the landlord (Dan Richards, 17 Oct 2026,
     lib/landlord-kinds): the papers the PLC check needs in place of one
     person's proof of ownership. */
  { key: "company_registration", label: "Companies House Registration", side: "landlord" },
  { key: "incorporation_certificate", label: "Certificate of Incorporation", side: "landlord" },
  { key: "grant_of_probate", label: "Grant of Probate", side: "landlord" },
  { key: "licensing", label: "Licensing Requirements", side: "home" },
  { key: "epc", label: "Energy Performance Certificate", side: "home" },
  { key: "gas_safety", label: "Gas Safety Certificate", side: "home" },
  { key: "eicr", label: "Electrical Installation Condition Report", side: "home" },
  /* Kirstie Mulholland, 19 Oct 2026: an inventory could only go on a home as
     a certificate, which wants an issue and an expiry date it doesn't have.
     It is a document, labelled so it is easy to spot. */
  { key: "inventory", label: "Inventory", side: "home" },
  /* A contractor's invoice off a works order (James, 19 Oct 2026). */
  { key: "contractor_invoice", label: "Contractor Invoice", side: "home" },
];

export const OTHER = "other";

export const SIDE_LABEL: Record<DocSide, string> = { tenant: "Tenant", landlord: "Landlord", home: "The home" };

export function docTypeLabel(key: string): string {
  if (key === OTHER) return "Other";
  return DOC_TYPES.find((t) => t.key === key)?.label ?? key;
}

/** An inventory, by its type or by the name somebody gave an Other before Inventory was a type. */
export const isInventory = (d: { type: string; name?: string | null }): boolean =>
  d.type === "inventory" || (d.type === OTHER && /inventor/i.test(String(d.name ?? "")));

/** An AML, KYC or sanctions check, by its name or what the reader called it. */
export const AML_WORDS = /\baml\b|anti.?money|money.?laund|\bkyc\b|sanction/i;

/**
 * Which guarantor type a guarantor's file is, from its name: a PLC upload
 * mirrored onto the Documents tab has only its check (Guarantor checks) and
 * the file name to go on. Null when the name says nothing.
 */
export function guarantorTypeFor(name: string): string | null {
  if (AML_WORDS.test(name)) return "guarantor_aml";
  if (/agreement|guarantee|deed|contract/i.test(name)) return "guarantor_agreement";
  if (/referenc/i.test(name)) return "guarantor_reference";
  if (/passport|licen[cs]e|\bid\b/i.test(name)) return "guarantor_id";
  return null;
}

/**
 * The "Not on file yet" list leaves the guarantor's papers out until one of
 * them is on the file: most lets have no guarantor, and four empty boxes on
 * every one of them would read as four things missing.
 */
export const hasGuarantorPapers = (held: Set<string>): boolean =>
  DOC_TYPES.some((t) => t.guarantor && held.has(t.key));

export const isDocType = (key: string): boolean => key === OTHER || DOC_TYPES.some((t) => t.key === key);

/** What a file may be: a PDF, a photo or a Word document. */
export const DOC_ACCEPT = "application/pdf,image/jpeg,image/png,image/webp,image/heic,.doc,.docx";
export const DOC_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
