import "server-only";
import { hasDb, q } from "@/lib/db";

/**
 * THE FACTS ON A HOME (24 Sep 2026).
 *
 * Susan's clean-sweep sheet lists what the OS must hold for every let home
 * before REX PM can go: licence, fees, NRL, landlord ID and AML, the tenancy's
 * type and dates, rent reviews, visits, guarantors, the deposit, and the
 * documents behind them. James: "whether that's a date, a word, or an actual
 * file" - so each is one row here, with where it came from.
 *
 * Sources, in the order they are tried: REX PM, then Propoly (which also
 * cross-checks what REX PM gave), then PayProp, then 'manual' - the checker,
 * home by home. Susan's own sheet counts as a source too ('Susan's sheet'),
 * for what only her merged reports hold (deposit reference, amount, date
 * protected). A value found in the first source stays attributed to it;
 * a later source that agrees is noted in checked_against, not written over.
 *
 * Files: file_key is the R2 folder documents/property-<id>/<field>/ that holds
 * every file for that column (a referencing pack is several). Propoly's files
 * come from its deals, so a folder can include an earlier tenancy's papers.
 */

export type FactKind = "word" | "date" | "number" | "money" | "file";

export interface FactField {
  key: string;
  label: string;
  group: "Property" | "Landlord & service" | "Tenancy" | "Guarantors" | "Deposit" | "Compliance" | "Documents" | "Sign-off";
  kind: FactKind;
  /** Only some homes need it (an HMO, a Welsh or Scottish home, an NRL landlord). */
  when?: "hmo" | "wales" | "scotland" | "nrl";
}

export const FIELDS: FactField[] = [
  { key: "property_type", label: "Property type", group: "Property", kind: "word" },
  { key: "licence_type", label: "Licence type", group: "Property", kind: "word", when: "hmo" },
  { key: "licence_number", label: "Licence number", group: "Property", kind: "word", when: "hmo" },
  { key: "licence_expiry", label: "Licence expiry", group: "Property", kind: "date", when: "hmo" },
  { key: "service_package", label: "Service", group: "Landlord & service", kind: "word" },
  { key: "fee_management", label: "Management fee", group: "Landlord & service", kind: "word" },
  { key: "fee_setup", label: "Set-up fee", group: "Landlord & service", kind: "word" },
  { key: "letting_agreement_start", label: "Letting agreement start", group: "Landlord & service", kind: "date" },
  { key: "nrl_status", label: "Non-resident landlord (NRL)", group: "Landlord & service", kind: "word" },
  { key: "landlord_photo_id", label: "Landlord photo ID", group: "Landlord & service", kind: "word" },
  { key: "landlord_aml", label: "Landlord AML check", group: "Landlord & service", kind: "word" },
  { key: "landlord_proof_of_ownership", label: "Proof of ownership", group: "Landlord & service", kind: "word" },
  { key: "landlord_proof_of_address", label: "Landlord proof of address", group: "Landlord & service", kind: "word" },
  { key: "rent_smart_wales", label: "Rent Smart Wales number", group: "Landlord & service", kind: "word", when: "wales" },
  { key: "landlord_registration", label: "Scottish landlord registration number", group: "Landlord & service", kind: "word", when: "scotland" },
  { key: "tenants_count", label: "Number of tenants", group: "Tenancy", kind: "number" },
  { key: "tenancy_type", label: "Tenancy type", group: "Tenancy", kind: "word" },
  { key: "tenancy_start", label: "Tenancy start", group: "Tenancy", kind: "date" },
  { key: "tenancy_end", label: "Tenancy end", group: "Tenancy", kind: "date" },
  { key: "tenancy_signed", label: "Tenancy signed", group: "Tenancy", kind: "date" },
  { key: "occupants", label: "Occupants", group: "Tenancy", kind: "number" },
  { key: "rent_rex_pm", label: "Rent (REX PM)", group: "Tenancy", kind: "money" },
  { key: "rent_matches_agreement", label: "Rent matches the agreement", group: "Tenancy", kind: "word" },
  { key: "rent_review_last", label: "Last rent review", group: "Tenancy", kind: "date" },
  { key: "rent_review_next", label: "Next rent review", group: "Tenancy", kind: "date" },
  { key: "visit_last", label: "Last property visit", group: "Tenancy", kind: "date" },
  { key: "visit_next", label: "Next property visit due", group: "Tenancy", kind: "date" },
  { key: "rtr_expiry", label: "Right to Rent expiry (earliest)", group: "Tenancy", kind: "date" },
  { key: "rtr_checked", label: "Right to Rent checked", group: "Tenancy", kind: "word" },
  { key: "rra_sheet_served", label: "RRA information sheet served", group: "Tenancy", kind: "date" },
  { key: "guarantors_count", label: "Number of guarantors", group: "Guarantors", kind: "number" },
  { key: "guarantor_names", label: "Guarantors", group: "Guarantors", kind: "word" },
  { key: "guarantor_contacts", label: "Guarantor contact details", group: "Guarantors", kind: "word" },
  { key: "deposit_ref", label: "Deposit scheme reference", group: "Deposit", kind: "word" },
  { key: "deposit_amount", label: "Deposit amount", group: "Deposit", kind: "money" },
  { key: "deposit_status", label: "Deposit status", group: "Deposit", kind: "word" },
  { key: "deposit_protected_on", label: "Date protected", group: "Deposit", kind: "date" },
  /* Propoly's deal says who registered it: "agent" (us) or "landlord" (their own scheme). */
  { key: "deposit_registered_by", label: "Deposit registered by", group: "Deposit", kind: "word" },
  { key: "epc_rating", label: "EPC rating", group: "Compliance", kind: "word" },
  { key: "pat_expiry", label: "PAT expiry", group: "Compliance", kind: "date", when: "hmo" },
  { key: "alarms_expiry", label: "Smoke & CO alarms", group: "Compliance", kind: "date", when: "hmo" },
  { key: "legionella_expiry", label: "Legionella risk assessment", group: "Compliance", kind: "date", when: "hmo" },
  { key: "repairing_standard", label: "Repairing Standard checked", group: "Compliance", kind: "date", when: "scotland" },
  { key: "doc_tenancy_agreement", label: "Tenancy agreement", group: "Documents", kind: "file" },
  { key: "doc_terms_of_business", label: "Terms of business", group: "Documents", kind: "file" },
  { key: "doc_deposit_cert", label: "Deposit certificate & prescribed info", group: "Documents", kind: "file" },
  { key: "doc_inventory", label: "Inventory / check-in", group: "Documents", kind: "file" },
  { key: "doc_tenant_referencing", label: "Tenant ID & referencing", group: "Documents", kind: "file" },
  { key: "doc_rtr_evidence", label: "Right to Rent evidence", group: "Documents", kind: "file" },
  { key: "doc_landlord_id_ownership", label: "Landlord ID & proof of ownership", group: "Documents", kind: "file" },
  { key: "doc_nrl1", label: "NRL1 approval letter", group: "Documents", kind: "file", when: "nrl" },
  { key: "doc_guarantor", label: "Guarantor documents", group: "Documents", kind: "file" },
  { key: "propoly_deal", label: "Propoly deal", group: "Sign-off", kind: "word" },
  { key: "check_signed_off", label: "Checked", group: "Sign-off", kind: "date" },
  { key: "check_notes", label: "Discrepancy notes", group: "Sign-off", kind: "word" },
  /* The second pass (25 Sep): each person signs off their own section of every home. */
  { key: "check_compliance", label: "Compliance checked", group: "Sign-off", kind: "date" },
  { key: "check_tenancy", label: "Tenancy checked", group: "Sign-off", kind: "date" },
  { key: "check_landlord", label: "Landlord, fees & deposit checked", group: "Sign-off", kind: "date" },
  { key: "check_notes_compliance", label: "Compliance notes", group: "Sign-off", kind: "word" },
  { key: "check_notes_tenancy", label: "Tenancy notes", group: "Sign-off", kind: "word" },
  { key: "check_notes_landlord", label: "Landlord, fees & deposit notes", group: "Sign-off", kind: "word" },
  { key: "verify_cert_gas", label: "Gas safety certificate checked", group: "Sign-off", kind: "word" },
  { key: "verify_cert_eicr", label: "EICR checked", group: "Sign-off", kind: "word" },
  { key: "verify_cert_epc", label: "EPC checked", group: "Sign-off", kind: "word" },
  { key: "doc_licence", label: "Licence", group: "Documents", kind: "file", when: "hmo" },
  { key: "doc_rra_sheet", label: "RRA information sheet", group: "Documents", kind: "file" },
  { key: "doc_landlord_registration", label: "Landlord registration evidence", group: "Documents", kind: "file", when: "scotland" },
  { key: "doc_prt_notes", label: "PRT easy read / supporting notes", group: "Documents", kind: "file", when: "scotland" },
];

export const FIELD_BY_KEY = new Map(FIELDS.map((f) => [f.key, f]));

export interface Fact {
  field: string;
  value: string | null;
  fileKey: string | null;
  source: string;
  sourceRef: string | null;
  checkedAgainst: string | null;
  capturedAt: string;
  capturedBy: string | null;
}

export async function factsFor(propertyId: string): Promise<Fact[]> {
  if (!hasDb()) return [];
  const rows = await q<{
    field: string; value: string | null; file_key: string | null; source: string; source_ref: string | null;
    checked_against: string | null; captured_at: Date; captured_by: string | null;
  }>(`SELECT * FROM os_property_facts WHERE property_id = $1`, [propertyId]).catch(() => []);
  return rows.map((r) => ({
    field: r.field, value: r.value, fileKey: r.file_key, source: r.source, sourceRef: r.source_ref,
    checkedAgainst: r.checked_against, capturedAt: new Date(r.captured_at).toISOString(), capturedBy: r.captured_by,
  }));
}

/**
 * Record a fact. A value already held from an earlier source is kept: the
 * first source to have it owns it (James, 24 Sep), and a later one only notes
 * whether it agrees. A person ('manual') always wins - they looked.
 */
export async function recordFact(p: {
  propertyId: string; field: string; value?: string | null; fileKey?: string | null;
  source: string; sourceRef?: string | null; by?: string | null;
}): Promise<void> {
  if (!hasDb() || !FIELD_BY_KEY.has(p.field)) return;
  await q(
    `INSERT INTO os_property_facts (property_id, field, value, file_key, source, source_ref, captured_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (property_id, field) DO UPDATE SET
       value = CASE WHEN EXCLUDED.source = 'manual' OR os_property_facts.value IS NULL THEN EXCLUDED.value ELSE os_property_facts.value END,
       file_key = COALESCE(CASE WHEN EXCLUDED.source = 'manual' THEN EXCLUDED.file_key END, os_property_facts.file_key, EXCLUDED.file_key),
       source = CASE WHEN EXCLUDED.source = 'manual' OR os_property_facts.value IS NULL THEN EXCLUDED.source ELSE os_property_facts.source END,
       checked_against = CASE WHEN EXCLUDED.source <> 'manual' AND os_property_facts.value IS NOT NULL AND EXCLUDED.source <> os_property_facts.source
         THEN EXCLUDED.source || CASE WHEN EXCLUDED.value = os_property_facts.value THEN ': same' ELSE ': differs (' || COALESCE(EXCLUDED.value,'') || ')' END
         ELSE os_property_facts.checked_against END,
       captured_at = NOW(), captured_by = COALESCE(EXCLUDED.captured_by, os_property_facts.captured_by)`,
    [p.propertyId, p.field, p.value ?? null, p.fileKey ?? null, p.source, p.sourceRef ?? null, p.by ?? null]
  );
}
