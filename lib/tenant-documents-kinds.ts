/**
 * The document kinds, on both sides of the server line.
 *
 * lib/tenant-documents is server-only because it talks to the database, and a
 * client component drawing the dropdown must not import a value from it - that
 * breaks the build, which is a lesson this codebase has now learned three
 * times in one day (the inspection report sheet, the works catalogue, this).
 * So the words live here and the server module re-exports them.
 */

export const TENANT_DOC_KINDS = [
  { id: "id", label: "Photo ID" },
  { id: "right_to_rent", label: "Right to rent" },
  { id: "reference", label: "A reference" },
  { id: "proof_of_income", label: "Proof of income" },
  { id: "proof_of_address", label: "Proof of address" },
  { id: "other", label: "Something else" },
] as const;

export type TenantDocKind = (typeof TENANT_DOC_KINDS)[number]["id"];

export const isTenantDocKind = (s: string): s is TenantDocKind =>
  TENANT_DOC_KINDS.some((k) => k.id === s);

export const tenantDocLabel = (id: string) =>
  TENANT_DOC_KINDS.find((k) => k.id === id)?.label ?? "Something else";

/** The row as both sides read it. */
export interface TenantDocument {
  id: string;
  dealId: string | null;
  kind: string;
  name: string;
  r2Key: string;
  bytes: number | null;
  contentType: string;
  uploadedAt: string;
}
