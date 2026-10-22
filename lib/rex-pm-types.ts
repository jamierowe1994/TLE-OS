/**
 * REX PM's compliance vocabulary, and where each kind lands in the OS
 * (22 Oct 2026).
 *
 * REX PM (Alfie) names its compliance types by free-text label, and the
 * labels are its own: "PAT Test", "Legionella Assessment", "Fire Risk
 * Assesment" (sic). The migration scripts that read it in September kept
 * their own short list in the scratchpad, and that list had no fire type at
 * all - so of an HMO's certificates only the EICR, PAT and legionella came
 * across, and 88 homes' fire safety stayed behind in REX PM (agents' call,
 * 20 Oct 2026). This is the whole vocabulary as REX PM held it on 6 Sep 2026
 * (18,244 entries), so the next read maps every label or says it cannot.
 *
 * No imports: the audit script (scripts/rex-pm-doc-audit.mjs) loads this file
 * directly under Node's type stripping, so the screens and the audit share
 * one list.
 */

/** Where a REX PM entry's file belongs in the OS. */
export type RexPmKind =
  /** A certificate: os_certificates (lib/certificate-intake), as this REX type. */
  | { as: "certificate"; type: string }
  /** A paper on the home: os_property_facts + R2 documents/property-<id>/<field>/. */
  | { as: "document"; field: string }
  /** No field of its own: the home's Documents tab (os_file_documents) as an Other, named. */
  | { as: "home_file"; name: string }
  /** Not a home's paper - a contractor's insurance, the agency's own memberships. */
  | { as: "not_home" };

const cert = (type: string): RexPmKind => ({ as: "certificate", type });
const doc = (field: string): RexPmKind => ({ as: "document", field });
const other = (name: string): RexPmKind => ({ as: "home_file", name });
const NOT_HOME: RexPmKind = { as: "not_home" };

/**
 * Every label REX PM used, lower-cased. The fire family is one certificate in
 * the OS ("Fire safety", REX's emergency_lighting_fire_exit) - the same slot
 * Michael files fire risk assessments, fire alarm and emergency lighting
 * certificates into, and the one an HMO's compliance asks for.
 */
const BY_LABEL: Record<string, RexPmKind> = {
  "gas safety": cert("gas_safety"),
  "gas safety certificate": cert("gas_safety"),
  "electrical installation condition report": cert("eicr"),
  eicr: cert("eicr"),
  epc: cert("epc"),
  "energy performance certificate": cert("epc"),
  "pat test": cert("portable_appliance_testing"),
  "portable appliance testing": cert("portable_appliance_testing"),
  "legionella assessment": cert("legionella_risk_assessment"),
  "legionella risk assessment": cert("legionella_risk_assessment"),
  "hmo licence": cert("mandatory_hmo_license"),
  "mandatory hmo license": cert("mandatory_hmo_license"),
  "additional hmo license": cert("additional_hmo_license"),
  "selective hmo license": cert("selective_hmo_license"),
  "selective licencing": cert("selective_hmo_license"),
  "smoke alarms": cert("smoke_alarms"),
  "co alarms": cert("co_alarms"),

  /* Fire. REX PM spells the assessment "Assesment"; both spellings map. */
  "fire risk assesment": cert("emergency_lighting_fire_exit"),
  "fire risk assessment": cert("emergency_lighting_fire_exit"),
  "fire alarm test certificate": cert("emergency_lighting_fire_exit"),
  "fire alarm": cert("emergency_lighting_fire_exit"),
  "emergency lighting test certificate": cert("emergency_lighting_fire_exit"),
  "emergency lighting and fire exit": cert("emergency_lighting_fire_exit"),
  "fire firefighting equipment": cert("emergency_lighting_fire_exit"),
  "fire extinguisher testing": cert("emergency_lighting_fire_exit"),

  /* Papers with no certificate slot: the clean sweep's fields (lib/property-facts), or an Other on the Documents tab. */
  "photo id": doc("doc_landlord_id_ownership"),
  "proof of ownership": doc("doc_landlord_id_ownership"),
  "proof of address": doc("landlord_proof_of_address"),
  "aml check": doc("landlord_aml"),
  "non-resident landlord": doc("doc_nrl1"),
  "letting agreement": doc("doc_terms_of_business"),
  "terms of business": doc("doc_terms_of_business"),
  "landlord registration": doc("doc_landlord_registration"),
  "right to rent": doc("doc_rtr_evidence"),
  "referencing certificate": doc("doc_tenant_referencing"),
  "tenancy agreement": doc("doc_tenancy_agreement"),
  "guarantor agreement": doc("doc_guarantor"),
  "oil safety certificate": other("Oil safety certificate"),
  "boiler service": other("Boiler service"),
  "chimney sweep": other("Chimney sweep"),
  "no gas": other("No gas declaration"),
  rlp: other("Rent and legal protection"),

  /* The agency's and contractors' own papers, held against a home in REX PM. */
  "public indemnity insurance": NOT_HOME,
  "professional indemnity insurance": NOT_HOME,
  "prs/tpo membership": NOT_HOME,
  "gas safe registered": NOT_HOME,
  "napit/niceic approved": NOT_HOME,
  "ico registration": NOT_HOME,
  "qualification certification": NOT_HOME,
  "contractors agreement": NOT_HOME,
};

/** What a REX PM compliance label is in the OS, or null for a label nobody has mapped yet. */
export function rexPmKind(label: string): RexPmKind | null {
  return BY_LABEL[label.trim().replace(/\s+/g, " ").toLowerCase()] ?? null;
}
