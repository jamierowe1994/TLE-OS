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
 */

/** Columns that are information, not something the sheet asks us to hold. */
const INFO = new Set([
  "property_type", "service_package", "fee_setup", "letting_agreement_start", "landlord_proof_of_address",
  "tenancy_end", "tenancy_signed", "occupants", "rent_rex_pm", "rent_review_next", "visit_last",
  "deposit_status", "landlord_photo_id", "landlord_proof_of_ownership", "doc_guarantor",
  "propoly_deal", "check_signed_off", "check_notes",
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
  id: string; address: string; ref: string; postcode: string | null; hmo: boolean; categories: string[] | null;
  landlord_name: string | null; agent_name: string | null; tenant_names: string | null; payprop_no: string | null;
};
type FactRow = { property_id: string; field: string; value: string | null; file_key: string | null; source: string; source_ref: string | null; checked_against: string | null; captured_at: Date; captured_by: string | null };

const isWales = (pc: string | null) => /^(CF|SA|NP|LD|LL)\d/i.test((pc ?? "").trim());

function homeIsHmo(p: PropRow, facts: Map<string, FactRow>): boolean {
  if (p.hmo) return true;
  if ((p.categories ?? []).some((c) => /hmo/i.test(c))) return true;
  return /hmo/i.test(facts.get("property_type")?.value ?? "");
}

/** The columns this home must hold, in catalogue order. */
export function neededFields(p: PropRow, facts: Map<string, FactRow>): FactField[] {
  const hmo = homeIsHmo(p, facts);
  const nrl = /^nrl/i.test(facts.get("nrl_status")?.value ?? "");
  const guarantors = Number(facts.get("guarantors_count")?.value ?? 0) > 0;
  return FIELDS.filter((f) => {
    if (INFO.has(f.key)) return false;
    if (f.when === "hmo" && !hmo) return false;
    if (f.when === "nrl" && !nrl) return false;
    if (f.when === "wales" && !isWales(p.postcode)) return false;
    if ((f.key === "guarantor_names" || f.key === "guarantor_contacts") && !guarantors) return false;
    return true;
  });
}

/** Held means a value or a file. Landlord ID / AML is one column on the sheet: either answers it. */
function held(key: string, facts: Map<string, FactRow>): boolean {
  const has = (k: string) => { const f = facts.get(k); return Boolean(f && (f.value || f.file_key)); };
  if (key === "landlord_aml") return has("landlord_aml") || has("landlord_photo_id");
  return has(key);
}

async function load(): Promise<{ props: PropRow[]; facts: Map<string, Map<string, FactRow>> }> {
  const props = await q<PropRow>(
    `SELECT id, address, ref, postcode, hmo, categories, landlord_name, agent_name, tenant_names, payprop_no
       FROM os_properties WHERE active`
  );
  const rows = await q<FactRow>(`SELECT * FROM os_property_facts`).catch(() => []);
  const facts = new Map<string, Map<string, FactRow>>();
  for (const r of rows) (facts.get(r.property_id) ?? facts.set(r.property_id, new Map()).get(r.property_id)!).set(r.field, r);
  return { props, facts };
}

export async function sweepList(): Promise<SweepHome[]> {
  if (!hasDb()) return [];
  const { props, facts } = await load();
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
      missing: need.filter((n) => !held(n.key, f)).length,
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
}

export interface SweepDetail {
  home: SweepHome & { postcode: string | null; rexPropertyId: string | null };
  facts: SweepFact[];
  certs: { key: string; label: string; days: number | null; file: boolean }[] | null;
  links: { rexPm: string | null; propoly: string | null };
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
    `SELECT id, address, ref, postcode, hmo, categories, landlord_name, agent_name, tenant_names, payprop_no, rex_property_id FROM os_properties WHERE id = $1`,
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
    if (e) certs = Object.entries(e.certs).map(([k, c]) => ({ key: k, label: CERT_LABEL[k] ?? k, days: c?.expires ?? null, file: Boolean(c?.attached || c?.fileUrl) }));
  } catch {
    certs = null;
  }

  const facts: SweepFact[] = FIELDS.filter((x) => x.group !== "Sign-off").map((x) => {
    const r = f.get(x.key);
    return {
      key: x.key, label: x.label, group: x.group, kind: x.kind, needed: need.has(x.key), held: held(x.key, f),
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
    },
    notes: f.get("check_notes")?.value ?? null,
  };
}

export const isFactKey = (k: string) => FIELD_BY_KEY.has(k);
