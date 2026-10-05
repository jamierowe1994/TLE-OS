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
}

export const DOC_TYPES: DocType[] = [
  { key: "holding_deposit_guide", label: "Holding Deposit Guide Signed", side: "tenant" },
  { key: "reference", label: "Reference", side: "tenant" },
  { key: "tenant_right_to_rent", label: "Tenant Right to Rent", side: "tenant" },
  { key: "tenant_proof_of_address", label: "Tenant Proof of Address", side: "tenant" },
  { key: "terms_of_business", label: "Terms of Business", side: "landlord" },
  { key: "landlord_id", label: "Landlord ID", side: "landlord" },
  { key: "landlord_proof_of_ownership", label: "Landlord Proof of Ownership", side: "landlord" },
  { key: "landlord_aml", label: "Landlord AML Check", side: "landlord" },
  { key: "licensing", label: "Licensing Requirements", side: "home" },
  { key: "epc", label: "Energy Performance Certificate", side: "home" },
  { key: "gas_safety", label: "Gas Safety Certificate", side: "home" },
  { key: "eicr", label: "Electrical Installation Condition Report", side: "home" },
];

export const OTHER = "other";

export const SIDE_LABEL: Record<DocSide, string> = { tenant: "Tenant", landlord: "Landlord", home: "The home" };

export function docTypeLabel(key: string): string {
  if (key === OTHER) return "Other";
  return DOC_TYPES.find((t) => t.key === key)?.label ?? key;
}

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
