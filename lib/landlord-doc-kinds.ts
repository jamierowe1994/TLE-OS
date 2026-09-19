/**
 * What a landlord can be asked to send, beyond the five every let needs.
 *
 * Susan, 19 Sep 2026: an HMO or a Scottish property needs more, and the agent
 * knows which - so the agent ticks what THIS property needs from the full
 * list, and the landlord's portal asks for exactly that. Automatic rules can
 * come later from the historic data; at launch the agent decides.
 *
 * Client-safe: the appraisal's picker and the portal both read it. The ticks
 * are kept in os_case_state under REQUIRED_DOCS_CASE, keyed by appraisal id.
 */

export const REQUIRED_DOCS_CASE = "required-docs";

export type ExtraDocKind =
  | "licence"
  | "fire"
  | "pat"
  | "alarms"
  | "legionella"
  | "landlord-reg"
  | "consent"
  | "leasehold"
  | "insurance";

export const EXTRA_DOC_KINDS: Array<{ id: ExtraDocKind; label: string; hint: string; group: "HMO" | "Scotland" | "Any property" }> = [
  { id: "licence", label: "HMO licence", hint: "From the council. Letting an unlicensed HMO is an unlimited fine.", group: "HMO" },
  { id: "fire", label: "Fire risk assessment", hint: "Reviewed every year on an HMO.", group: "HMO" },
  { id: "pat", label: "PAT test certificate", hint: "Appliances the landlord supplies. Required in Scotland, expected on HMOs.", group: "HMO" },
  { id: "alarms", label: "Smoke and carbon monoxide alarm check", hint: "Interlinked alarms in Scotland; every floor in England.", group: "HMO" },
  { id: "legionella", label: "Legionella risk assessment", hint: "Required in Scotland, good practice everywhere.", group: "Scotland" },
  { id: "landlord-reg", label: "Scottish landlord registration", hint: "The registration number, from the council.", group: "Scotland" },
  { id: "consent", label: "Lender's consent to let", hint: "Where there is a mortgage that is not buy-to-let.", group: "Any property" },
  { id: "leasehold", label: "Head-lease or freeholder permission", hint: "A leasehold flat whose lease needs consent to sublet.", group: "Any property" },
  { id: "insurance", label: "Landlord insurance", hint: "Buildings insurance that covers letting.", group: "Any property" },
];

export const isExtraDocKind = (v: string): v is ExtraDocKind => EXTRA_DOC_KINDS.some((k) => k.id === v);

/** The stored shape: which extras this property needs. */
export type RequiredDocsCase = { extra: ExtraDocKind[] };
