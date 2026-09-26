import "server-only";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { hasDb, q } from "@/lib/db";
import { FIELDS, FIELD_BY_KEY, type FactField } from "@/lib/property-facts";
import { R2_BUCKET, r2Configured, withR2 } from "@/lib/r2";
import { getComplianceBook } from "@/lib/compliance-cache";

/**
 * THE CLEAN SWEEP (James, Susan and Howard, 24 Sep 2026).
 *
 * Before REX PM goes, somebody walks every let home and checks what the OS now
 * holds against REX PM and Propoly: "she'll have a button, check REX PM, does
 * everything match, is there any documents missing, add them". The OS was
 * filled from REX PM, Propoly and Susan's sheet first (lib/property-facts), so
 * the checker sense-checks and fills the gaps rather than typing a book in.
 *
 * Oldest portfolio first - the longest-standing agreements are where renewed
 * certificates and changed tenancies were most likely missed.
 *
 * What a home NEEDS is decided here, not on the screen, so the count on the
 * list and the red rows in the detail can never disagree: licence, PAT, alarms
 * and legionella only on an HMO; an NRL1 letter only for an NRL landlord; Rent
 * Smart Wales only in Wales; guarantor details only where there is one.
 *
 * Agreed with Susan, Kirstie and Michael on 25 Sep, and the same rules the
 * Clean Sweep Check report scores by:
 *  - Tenant-find / let-only ("market only") homes carry no compliance,
 *    Right to Rent, inventory, visits or rent reviews: the landlord's duty.
 *  - Right to Rent and the Renters' Rights Act sheet are English law, so never
 *    asked of a Scottish home.
 *  - In Scotland the Repairing Standard puts PAT, interlinked alarms and a
 *    legionella assessment on every managed home, not only HMOs; Scottish
 *    homes also need the landlord registration and the PRT's easy read notes.
 *  - AML checks began in May 2025, so older agreements are not asked for one.
 *  - Smoke and CO alarms are recorded on the gas safety record, so a gas
 *    certificate on file answers that column.
 */

/** Columns that are information, not something the sheet asks us to hold. */
const INFO = new Set([
  "property_type", "service_package", "fee_setup", "letting_agreement_start", "landlord_proof_of_address",
  "tenancy_end", "tenancy_signed", "occupants", "rent_rex_pm", "rent_review_next", "visit_last",
  "deposit_status", "landlord_photo_id", "landlord_proof_of_ownership", "doc_guarantor",
  "propoly_deal", "check_signed_off", "check_notes", "deposit_registered_by",
]);

export interface SweepHome {
  id: string;
  address: string;
  ref: string;
  paypropNo: string | null;
  onSheet: boolean;
  landlord: string | null;
  agent: string | null;
  tenants: string | null;
  since: string | null;
  hmo: boolean;
  needed: number;
  missing: number;
  checkedAt: string | null;
  checkedBy: string | null;
}

type PropRow = {
  id: string; address: string; ref: string; postcode: string | null; hmo: boolean; categories: string[] | null; management: string | null; rex_property_id: string | null; service_level?: string | null;
  landlord_name: string | null; agent_name: string | null; tenant_names: string | null; payprop_no: string | null;
};
type FactRow = { property_id: string; field: string; value: string | null; file_key: string | null; source: string; source_ref: string | null; checked_against: string | null; captured_at: Date; captured_by: string | null; verified_at?: Date | null; verified_by?: string | null };

const isWales = (pc: string | null) => /^(CF|SA|NP|LD|LL)\d/i.test((pc ?? "").trim());
/** Scottish postcode areas; the address decides when the sheet gave no postcode. */
const isScotland = (p: PropRow) =>
  /^(AB|DD|DG|EH|FK|G\d|HS|IV|KA|KW|KY|ML|PA|PH|TD|ZE)/i.test((p.postcode ?? "").trim()) ||
  (!p.postcode && /\b(edinburgh|glasgow)\b/i.test(p.address));

/** Tenant-find / let only: the landlord keeps the compliance. */
function isManaged(p: PropRow, facts: Map<string, FactRow>): boolean {
  /* The OS's own decision (newest of REX PM and PayProp) comes first. */
  if (p.service_level === "managed") return true;
  if (p.service_level === "market_only") return false;
  const service = facts.get("service_package")?.value || p.management || "";
  return !/tenant.?find|let.?only|no letting agreement/i.test(service);
}

/** Only asked of a home we manage. */
const MANAGED_ONLY = new Set([
  "licence_type", "licence_number", "licence_expiry", "doc_licence", "pat_expiry", "alarms_expiry", "legionella_expiry",
  "rtr_expiry", "rtr_checked", "doc_rtr_evidence", "rra_sheet_served", "doc_rra_sheet", "visit_next", "rent_review_last",
  "doc_inventory", "repairing_standard", "doc_prt_notes",
  /* Tenant-find pays a one-off set-up fee, not a management percentage. */
  "fee_management",
]);
/** English law: never asked in Scotland. */
const ENGLAND_ONLY = new Set(["rtr_expiry", "rtr_checked", "doc_rtr_evidence", "rra_sheet_served", "doc_rra_sheet"]);
/** The Repairing Standard: every managed Scottish home, HMO or not. */
const SCOTLAND_EVERY_HOME = new Set(["pat_expiry", "alarms_expiry", "legionella_expiry"]);
const AML_FROM = "2025-05-01";
const DEPOSIT = new Set(["deposit_ref", "deposit_amount", "deposit_protected_on", "doc_deposit_cert"]);
/** Tenant-find: we did the let, not the running of it, so these are the landlord's (James, 26 Sep). */
const NOT_ON_MARKET_ONLY = new Set(["rent_matches_agreement", "guarantor_contacts"]);

function homeIsHmo(p: PropRow, facts: Map<string, FactRow>): boolean {
  if (p.hmo) return true;
  if ((p.categories ?? []).some((c) => /hmo/i.test(c))) return true;
  return /hmo/i.test(facts.get("property_type")?.value ?? "");
}

/** The columns this home must hold, in catalogue order. */
export function neededFields(p: PropRow, facts: Map<string, FactRow>): FactField[] {
  const hmo = homeIsHmo(p, facts);
  const scot = isScotland(p);
  const managed = isManaged(p, facts);
  const nrl = /^nrl/i.test(facts.get("nrl_status")?.value ?? "");
  const guarantors = Number(facts.get("guarantors_count")?.value ?? 0) > 0;
  const since = facts.get("letting_agreement_start")?.value ?? "";
  return FIELDS.filter((f) => {
    if (INFO.has(f.key) || f.group === "Sign-off") return false;
    if (MANAGED_ONLY.has(f.key) && !managed) return false;
    if (ENGLAND_ONLY.has(f.key) && scot) return false;
    if (f.when === "hmo" && !hmo && !(scot && SCOTLAND_EVERY_HOME.has(f.key))) return false;
    if (f.when === "nrl" && !nrl) return false;
    if (f.when === "wales" && !isWales(p.postcode)) return false;
    if (f.when === "scotland" && !scot) return false;
    if (f.key === "landlord_aml" && since < AML_FROM) return false;
    if (!managed && NOT_ON_MARKET_ONLY.has(f.key)) return false;
    /* The deposit is ours to evidence only where we registered it: a landlord's
       own scheme, or a tenant-find let we did not register, is theirs. */
    const depBy = (facts.get("deposit_registered_by")?.value ?? "").toLowerCase();
    if (DEPOSIT.has(f.key) && (depBy === "landlord" || (!managed && depBy !== "agent"))) return false;
    if ((f.key === "guarantor_names" || f.key === "guarantor_contacts") && !guarantors) return false;
    return true;
  });
}

/**
 * Held means a value or a file. Landlord ID / AML is one column on the sheet:
 * either answers it. Alarms are answered by a gas safety certificate on file.
 */
function held(key: string, facts: Map<string, FactRow>, gasOnFile = false): boolean {
  const has = (k: string) => { const f = facts.get(k); return Boolean(f && (f.value || f.file_key)); };
  if (key === "landlord_aml") return has("landlord_aml") || has("landlord_photo_id");
  if (key === "alarms_expiry") return has(key) || gasOnFile;
  return has(key);
}

/** Homes with a gas safety certificate on file, from the compliance book (cached; skipped if it is cold). */
async function gasCertified(): Promise<Set<string>> {
  try {
    const got = await Promise.race([getComplianceBook(), new Promise<null>((r) => setTimeout(() => r(null), 3000))]);
    if (!got) return new Set();
    return new Set(got.book.properties.filter((e) => e.certs?.gas?.expires != null || e.certs?.gas?.attached).map((e) => String(e.id)));
  } catch {
    return new Set();
  }
}
const gasFor = (p: PropRow, gas: Set<string>) => gas.has(String(p.rex_property_id ?? "")) || gas.has(p.id);

async function load(): Promise<{ props: PropRow[]; facts: Map<string, Map<string, FactRow>> }> {
  const props = await q<PropRow>(
    `SELECT id, address, ref, postcode, hmo, categories, management, rex_property_id, service_level, landlord_name, agent_name, tenant_names, payprop_no
       FROM os_properties WHERE active`
  );
  const rows = await q<FactRow>(`SELECT * FROM os_property_facts`).catch(() => []);
  const facts = new Map<string, Map<string, FactRow>>();
  for (const r of rows) (facts.get(r.property_id) ?? facts.set(r.property_id, new Map()).get(r.property_id)!).set(r.field, r);
  return { props, facts };
}

/**
 * No tenant has moved in yet (James, 25 Sep 2026): nobody named in any system
 * and no tenant count, or a tenancy that starts in the future. These are
 * parked, off the lists and out of the missing count, until somebody moves in.
 */
export function notLetYet(p: PropRow & { tenant_names?: string | null }, facts: Map<string, FactRow>): boolean {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const start = (facts.get("tenancy_start")?.value ?? "").slice(0, 10);
  if (start && start > today) return true;
  const named = Boolean((p.tenant_names ?? "").trim());
  const counted = Number(facts.get("tenants_count")?.value ?? 0) > 0;
  return !named && !counted;
}

export async function sweepList(): Promise<SweepHome[]> {
  if (!hasDb()) return [];
  const [{ props: all, facts }, gas] = await Promise.all([load(), gasCertified()]);
  const props = all.filter((p) => !notLetYet(p, facts.get(p.id) ?? new Map()));
  const out: SweepHome[] = props.map((p) => {
    const f = facts.get(p.id) ?? new Map<string, FactRow>();
    const need = neededFields(p, f);
    const signed = f.get("check_signed_off");
    return {
      id: p.id,
      address: p.address,
      ref: p.ref,
      paypropNo: p.payprop_no,
      onSheet: Boolean(p.payprop_no),
      landlord: p.landlord_name,
      agent: p.agent_name,
      tenants: p.tenant_names,
      since: f.get("letting_agreement_start")?.value ?? f.get("tenancy_start")?.value ?? null,
      hmo: homeIsHmo(p, f),
      needed: need.length,
      missing: need.filter((n) => !held(n.key, f, gasFor(p, gas))).length,
      checkedAt: signed?.value ?? null,
      checkedBy: signed?.captured_by ?? null,
    };
  });
  /* Oldest portfolio first; homes with no known start at the end. */
  return out.sort((a, b) => (a.since ?? "9999").localeCompare(b.since ?? "9999") || a.address.localeCompare(b.address));
}

export interface SweepFact {
  key: string; label: string; group: string; kind: string; needed: boolean; held: boolean;
  value: string | null; source: string | null; sourceRef: string | null; checkedAgainst: string | null;
  capturedAt: string | null; capturedBy: string | null; files: { key: string; name: string }[];
  /** Why a column with no value of its own still counts as held. */
  note: string | null;
  /** Ticked as right by a person in the second pass. */
  verifiedAt: string | null;
  verifiedBy: string | null;
}

export interface SweepDetail {
  home: SweepHome & { postcode: string | null; rexPropertyId: string | null };
  facts: SweepFact[];
  certs: { key: string; label: string; days: number | null; file: boolean; expiresOn: string | null; fileUrl: string | null; notRequired: boolean; checkedBy: string | null }[] | null;
  /** Who signed each section off, and when (the second pass). */
  sections: Record<string, { at: string; by: string | null } | null>;
  sectionNotes: Record<string, string | null>;
  links: { rexPm: string | null; propoly: string | null; payprop: string | null };
  notes: string | null;
}

async function filesUnder(prefix: string): Promise<{ key: string; name: string }[]> {
  if (!r2Configured) return [];
  const out: { key: string; name: string }[] = [];
  let token: string | undefined;
  do {
    const res = await withR2((c) => c.send(new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: prefix, ContinuationToken: token })));
    for (const o of res.Contents ?? []) {
      if (!o.Key) continue;
      const base = o.Key.slice(o.Key.lastIndexOf("/") + 1).replace(/^(rexpm|propoly|manual)-\d+-/, "");
      out.push({ key: o.Key, name: base });
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return out;
}

const CERT_LABEL: Record<string, string> = { gas: "Gas safety", eicr: "EICR", epc: "EPC", pat: "PAT", licence: "Licence", legionella: "Legionella", alarms: "Alarms", fire: "Fire" };

export async function sweepDetail(id: string): Promise<SweepDetail | null> {
  if (!hasDb()) return null;
  const props = await q<PropRow & { rex_property_id: string | null }>(
    `SELECT id, address, ref, postcode, hmo, categories, management, rex_property_id, service_level, landlord_name, agent_name, tenant_names, payprop_no FROM os_properties WHERE id = $1`,
    [id]
  );
  const p = props[0];
  if (!p) return null;
  const rows = await q<FactRow>(`SELECT * FROM os_property_facts WHERE property_id = $1`, [id]);
  const f = new Map(rows.map((r) => [r.field, r]));
  const need = new Set(neededFields(p, f).map((n) => n.key));
  const files = await filesUnder(`documents/property-${id}/`).catch(() => []);
  const byField = new Map<string, { key: string; name: string }[]>();
  for (const fl of files) {
    const field = fl.key.split("/")[2];
    (byField.get(field) ?? byField.set(field, []).get(field)!).push(fl);
  }
  const list = (await sweepList()).find((h) => h.id === id)!;

  let certs: SweepDetail["certs"] = null;
  try {
    /* The book is cached and usually instant; cold, it rebuilds from REX and
       can take minutes. The certificates are a side line on this screen, so
       they wait three seconds at most and the home opens without them. */
    const got = await Promise.race([getComplianceBook(), new Promise<null>((r) => setTimeout(() => r(null), 3000))]);
    if (!got) throw new Error("book not ready");
    const { book } = got;
    const e = book.properties.find((x) => x.id === (p.rex_property_id ?? "") || x.id === id);
    if (e) certs = Object.entries(e.certs).map(([k, c]) => {
      const days = c?.expires ?? null;
      const on = days == null ? null : new Date(Date.now() + days * 864e5).toLocaleDateString("en-CA", { timeZone: "Europe/London" });
      const chk = f.get(`verify_cert_${k}`);
      return { key: k, label: CERT_LABEL[k] ?? k, days, file: Boolean(c?.attached || c?.fileUrl), expiresOn: on, fileUrl: c?.fileUrl ?? null,
        notRequired: Boolean((c as { notRequired?: boolean } | undefined)?.notRequired), checkedBy: chk ? `${chk.captured_by ?? ""}` : null };
    });
  } catch {
    certs = null;
  }

  const gasOnFile = Boolean(certs?.find((c) => c.key === "gas" && (c.days != null || c.file)));
  const facts: SweepFact[] = FIELDS.filter((x) => x.group !== "Sign-off").map((x) => {
    const r = f.get(x.key);
    const byGas = x.key === "alarms_expiry" && !(r?.value || r?.file_key) && gasOnFile;
    return {
      key: x.key, label: x.label, group: x.group, kind: x.kind, needed: need.has(x.key), held: held(x.key, f, gasOnFile),
      note: byGas ? "Covered by the gas safety record" : null,
      verifiedAt: r?.verified_at ? new Date(r.verified_at).toISOString() : null, verifiedBy: r?.verified_by ?? null,
      value: r?.value ?? null, source: r?.source ?? null, sourceRef: r?.source_ref ?? null, checkedAgainst: r?.checked_against ?? null,
      capturedAt: r ? new Date(r.captured_at).toISOString() : null, capturedBy: r?.captured_by ?? null,
      files: byField.get(x.key) ?? [],
    };
  });
  const uuid = id.startsWith("pm-") && !id.startsWith("pm-0000-") ? id.slice(3) : null;
  const deal = f.get("propoly_deal")?.value ?? null;
  return {
    home: { ...list, postcode: p.postcode, rexPropertyId: p.rex_property_id },
    facts,
    certs,
    links: {
      rexPm: uuid ? `https://alfie.app.rexsoftware.com/property/${uuid}` : null,
      propoly: deal ? `https://tle.propoly.com/deals/${deal}` : null,
      /* Susan's sheets carry PayProp's own property number, which is the id in its web links. */
      payprop: p.payprop_no && /^\d+$/.test(p.payprop_no) ? `https://uk.payprop.com/c/property/${p.payprop_no}` : null,
    },
    notes: f.get("check_notes")?.value ?? null,
    sections: Object.fromEntries((["compliance", "tenancy", "landlord"] as const).map((k) => {
      const r = f.get(`check_${k}`);
      return [k, r?.value ? { at: r.value, by: r.captured_by } : null];
    })),
    sectionNotes: Object.fromEntries((["compliance", "tenancy", "landlord"] as const).map((k) => [k, f.get(`check_notes_${k}`)?.value ?? null])),
  };
}

export const isFactKey = (k: string) => FIELD_BY_KEY.has(k);

/* ── The second pass: three people, three sections of every home ─────────────
 *
 * James, 25 Sep: Michael, Kirstie and Joe each go through every home on
 * Susan's sheets, checking their own section against REX PM, Propoly and
 * PayProp, ticking what is right, fixing what is not and uploading what is
 * missing. One pass, then the OS is the source of truth.
 */
export type SectionKey = "compliance" | "tenancy" | "landlord";
export const SECTIONS: { key: SectionKey; label: string; who: string; fields: string[]; certs?: boolean }[] = [
  {
    key: "compliance", label: "Compliance", who: "Michael", certs: true,
    fields: ["epc_rating", "pat_expiry", "alarms_expiry", "legionella_expiry", "repairing_standard", "licence_type", "licence_number", "licence_expiry", "doc_licence"],
  },
  {
    key: "tenancy", label: "Tenancy & tenants", who: "Kirstie",
    fields: ["tenants_count", "tenancy_type", "tenancy_start", "tenancy_end", "rent_matches_agreement", "rent_review_last", "visit_next",
      "rtr_expiry", "rtr_checked", "doc_rtr_evidence", "guarantors_count", "guarantor_names", "guarantor_contacts", "doc_guarantor",
      "doc_tenancy_agreement", "doc_prt_notes", "doc_tenant_referencing", "doc_inventory", "rra_sheet_served", "doc_rra_sheet"],
  },
  {
    key: "landlord", label: "Landlord, fees & deposit", who: "Joe",
    fields: ["service_package", "fee_management", "fee_setup", "letting_agreement_start", "doc_terms_of_business", "nrl_status", "doc_nrl1",
      "landlord_aml", "landlord_photo_id", "doc_landlord_id_ownership", "landlord_registration", "doc_landlord_registration", "rent_smart_wales",
      "deposit_ref", "deposit_amount", "deposit_protected_on", "doc_deposit_cert"],
  },
];
export const SECTION_BY_KEY = new Map(SECTIONS.map((x) => [x.key, x]));

export interface QueueHome { id: string; address: string; landlord: string | null; since: string | null; missing: number; doneAt: string | null; doneBy: string | null }

/** Susan's homes, oldest first, with how much of this section each still lacks and whether it is signed off. */
export async function sectionQueue(section: SectionKey): Promise<QueueHome[]> {
  if (!hasDb()) return [];
  const sec = SECTION_BY_KEY.get(section)!;
  const [{ props, facts }, gas] = await Promise.all([load(), gasCertified()]);
  const own = new Set(sec.fields);
  return props
    .filter((p) => p.payprop_no && !notLetYet(p, facts.get(p.id) ?? new Map()))
    .map((p) => {
      const f = facts.get(p.id) ?? new Map<string, FactRow>();
      const need = neededFields(p, f).filter((n) => own.has(n.key));
      const done = f.get(`check_${section}`);
      return {
        id: p.id, address: p.address, landlord: p.landlord_name,
        since: f.get("letting_agreement_start")?.value ?? f.get("tenancy_start")?.value ?? null,
        missing: need.filter((n) => !held(n.key, f, gasFor(p, gas))).length,
        doneAt: done?.value ?? null, doneBy: done?.captured_by ?? null,
      };
    })
    .sort((a, b) => (a.since ?? "9999").localeCompare(b.since ?? "9999") || a.address.localeCompare(b.address));
}
