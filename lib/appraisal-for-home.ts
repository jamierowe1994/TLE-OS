import "server-only";
import { hasDb, q } from "@/lib/db";
import { sameHome } from "@/lib/address-parse";
import { isOsLead, osContactIdFrom } from "@/lib/contacts-as-leads";
import { SERVICE_LEVELS, type MaStage } from "@/lib/market-appraisal";
import { DOC_TYPES } from "@/lib/doc-types";

/**
 * WHAT THE APPRAISAL LEARNED, ON THE LISTING IT BECAME (James, 10 Nov 2026).
 *
 * "It's taking it through to the next section without any of the information
 * from the market appraisal." A won appraisal turned into a REX listing with
 * no owner on it, so the listing's Landlord box was empty while the OS knew
 * exactly who the landlord was, how to reach them, what was agreed and what
 * they had sent. Nothing was lost: it all sat on the appraisal and its lead.
 * Nothing READ it from the listing.
 *
 * So this finds the appraisal behind a home and reads what it holds where it
 * already lives - the lead's contact, the appraisal row, the lead's facts and
 * notes, the papers on the lead, the landlord's portal, the signed terms and
 * the ID checks. Nothing is copied: a copy goes stale the first time somebody
 * corrects a number on the lead.
 *
 * WHICH APPRAISAL. The appraisal linked to the home's REX property (the way a
 * listing made from an appraisal is joined to it); failing that, a won one at
 * the same door that was never linked to any property. Lost, cancelled and
 * archived appraisals are never the answer: their landlord may never have
 * instructed us. A won one beats one still in progress, then the newest.
 *
 * Reads only.
 */

export type AppraisalLandlord = {
  name: string;
  email: string | null;
  phone: string | null;
  /** REX's contact id, when the lead's contact is in REX. */
  rexContactId: string | null;
  /** "os:<contact id>" or "rex:<contact id>", for ContactBlock; null when nothing names them. */
  ref: string | null;
  /** What the agent wrote on the contact. */
  notes: string | null;
};

export type HomeAppraisal = {
  id: string;
  leadId: string | null;
  stage: MaStage;
  address: string;
  agent: string | null;
  appointmentAt: string | null;
  valuation: number | null;
  valuationNote: string | null;
  valuedAt: string | null;
  valuedBy: string | null;
  feePct: number | null;
  setupFee: number | null;
  otherFees: string | null;
  serviceLevel: string | null;
  termsSentAt: string | null;
  landlord: AppraisalLandlord | null;
};

type Row = {
  id: string; lead_id: string | null; stage: string; address: string; postcode: string | null; agent: string | null;
  appointment_at: Date | null; valuation: number | null; valuation_note: string | null; valued_at: Date | null;
  valued_by: string | null; fee_pct: string | number | null; setup_fee: number | null; other_fees: string | null;
  service_level: string | null; terms_sent_at: Date | null; landlord: string; rex_property_id: string | null;
};

const COLS = `id, lead_id, stage, address, postcode, agent, appointment_at, valuation, valuation_note, valued_at, valued_by,
              fee_pct, setup_fee, other_fees, service_level, terms_sent_at, landlord, rex_property_id`;
/* Never a lost, cancelled or archived one; a won one first, then the newest. */
const LIVE = `stage <> 'lost' AND cancelled_at IS NULL AND archived_at IS NULL`;
const ORDER = `ORDER BY (stage = 'won') DESC, updated_at DESC NULLS LAST`;

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);
const text = (v: unknown) => {
  const s = v == null ? "" : String(v).trim();
  return s || null;
};

/** The appraisal behind a home, by its REX property and, failing that, its address. */
async function findRow(home: { propertyId?: string | null; address?: string | null }): Promise<Row | null> {
  if (!hasDb()) return null;
  const pid = text(home.propertyId);
  if (pid) {
    const [r] = await q<Row>(`SELECT ${COLS} FROM os_market_appraisals WHERE rex_property_id = $1 AND ${LIVE} ${ORDER} LIMIT 1`, [pid]).catch(() => []);
    if (r) return r;
  }
  const address = text(home.address);
  if (!address) return null;
  /* By the door: only a WON appraisal that was never linked to a property
     (NULL, or '' when a person unlinked it), so one linked to another home
     can never be picked up by a similar address. */
  const rows = await q<Row>(
    `SELECT ${COLS} FROM os_market_appraisals
      WHERE stage = 'won' AND ${LIVE} AND COALESCE(rex_property_id, '') = ''
      ${ORDER} LIMIT 400`
  ).catch(() => []);
  return rows.find((r) => sameHome([r.address, r.postcode].filter(Boolean).join(", "), address)) ?? null;
}

/** Who the landlord is, from the lead the appraisal was booked from. */
async function landlordOf(r: Row): Promise<AppraisalLandlord | null> {
  const lead = text(r.lead_id);
  if (lead && isOsLead(lead)) {
    const [c] = await q<{ id: string; name: string; email: string; mobile: string; notes: string; rex_id: string | null }>(
      `SELECT id, name, email, mobile, notes, rex_id FROM os_contacts WHERE id = $1`,
      [osContactIdFrom(lead)]
    ).catch(() => []);
    if (c && text(c.name)) {
      const rexId = text(c.rex_id);
      return {
        name: c.name.trim(),
        email: text(c.email),
        phone: text(c.mobile),
        rexContactId: rexId && /^\d+$/.test(rexId) ? rexId : null,
        ref: `os:${c.id}`,
        notes: text(c.notes),
      };
    }
  } else if (lead) {
    /* A REX lead: its email and phone are on the lead ledger (lib/appraisal-store). */
    const [l] = await q<{ name: string | null; email: string | null; phone: string | null; contact_id: string | null }>(
      `SELECT name, email, phone, contact_id FROM os_leads WHERE id = $1`,
      [lead]
    ).catch(() => []);
    if (l) {
      const rexId = text(l.contact_id);
      const name = text(l.name) ?? text(r.landlord);
      if (name) {
        return {
          name,
          email: text(l.email),
          phone: text(l.phone),
          rexContactId: rexId && /^\d+$/.test(rexId) ? rexId : null,
          ref: rexId ? `rex:${rexId}` : null,
          notes: null,
        };
      }
    }
  }
  /* Booked straight onto the appraisal: its own name is all there is. */
  const name = text(r.landlord);
  return name ? { name, email: null, phone: null, rexContactId: null, ref: null, notes: null } : null;
}

function shape(r: Row, landlord: AppraisalLandlord | null): HomeAppraisal {
  return {
    id: r.id,
    leadId: text(r.lead_id),
    stage: r.stage as MaStage,
    address: r.address,
    agent: text(r.agent),
    appointmentAt: iso(r.appointment_at),
    valuation: r.valuation ?? null,
    valuationNote: text(r.valuation_note),
    valuedAt: iso(r.valued_at),
    valuedBy: text(r.valued_by),
    feePct: r.fee_pct == null || r.fee_pct === "" ? null : Number(r.fee_pct),
    setupFee: r.setup_fee ?? null,
    otherFees: text(r.other_fees),
    serviceLevel: r.service_level ? SERVICE_LEVELS.find((s) => s.id === r.service_level)?.label ?? r.service_level : null,
    termsSentAt: iso(r.terms_sent_at),
    landlord,
  };
}

/** The appraisal behind a home and its landlord, or null when there is none. */
export async function appraisalForHome(home: { propertyId?: string | null; address?: string | null }): Promise<HomeAppraisal | null> {
  const r = await findRow(home);
  if (!r) return null;
  return shape(r, await landlordOf(r).catch(() => null));
}

/* ── everything else it holds, for the listing's own page ─────────────── */

export type AppraisalNote = { at: string; by: string | null; kind: string; body: string };

/**
 * One paper the appraisal or its lead holds. `type` is the listing's own
 * document type (lib/doc-types) where there is one, so the listing's
 * Compliance rows can say "from the appraisal" instead of "not on file".
 */
export type AppraisalPaper = {
  key: string;
  type: string;
  label: string;
  name: string;
  at: string | null;
  /** Where it came from, in words: "Uploaded on the lead", "Sent through the landlord portal"... */
  how: string;
  r2Key: string;
};

export type AppraisalDossier = HomeAppraisal & {
  facts: Array<{ label: string; value: string }>;
  notes: AppraisalNote[];
  papers: AppraisalPaper[];
};

const LEAD_TAG_TYPE: Record<string, string> = {
  ID: "landlord_id",
  "Proof of ownership": "landlord_proof_of_ownership",
  "AML check": "landlord_aml",
  EPC: "epc",
  "Gas safety": "gas_safety",
  EICR: "eicr",
};
const PORTAL_KIND_TYPE: Record<string, string> = {
  id: "landlord_id",
  ownership: "landlord_proof_of_ownership",
  gas: "gas_safety",
  eicr: "eicr",
  epc: "epc",
};
const labelOf = (type: string, fallback: string) => DOC_TYPES.find((t) => t.key === type)?.label ?? fallback;

/** The property facts the lead and the take-on hold, the take-on's answer winning. */
async function factsOf(a: HomeAppraisal): Promise<AppraisalDossier["facts"]> {
  const [lead, takeOn] = await Promise.all([
    a.leadId
      ? q<{ property: Record<string, unknown> | null }>(`SELECT property FROM os_lead_facts WHERE lead_id = $1`, [a.leadId]).then((r) => r[0]?.property ?? null).catch(() => null)
      : Promise.resolve(null),
    import("@/lib/takeon").then((m) => m.takeOnDetails(a.id)).catch(() => null),
  ]);
  const { DETAIL_FIELDS } = await import("@/lib/takeon");
  const fromLead: Record<string, unknown> = {
    propertyType: lead?.type,
    beds: lead?.beds,
    baths: lead?.baths,
    receptions: lead?.receptions,
    epc: lead?.epc,
  };
  const saved = (takeOn?.fields ?? {}) as Record<string, string>;
  const out: AppraisalDossier["facts"] = [];
  for (const f of DETAIL_FIELDS) {
    const v = text(saved[f.id]) ?? text(fromLead[f.id]);
    if (v) out.push({ label: f.label, value: v });
  }
  return out;
}

/** What was written about the landlord and the home before it was a listing. */
async function notesOf(a: HomeAppraisal): Promise<AppraisalNote[]> {
  if (!a.leadId) return [];
  const rows = await q<{ kind: string; body: string; by_name: string | null; at: Date }>(
    `SELECT kind, body, by_name, at FROM os_lead_touches
      WHERE lead_id = $1 AND btrim(body) <> '' ORDER BY at DESC LIMIT 30`,
    [a.leadId]
  ).catch(() => []);
  return rows.map((r) => ({ at: new Date(r.at).toISOString(), by: text(r.by_name), kind: r.kind, body: r.body.trim() }));
}

/** Every paper on the appraisal and its lead, newest first. */
async function papersOf(a: HomeAppraisal): Promise<AppraisalPaper[]> {
  const email = (a.landlord?.email ?? "").toLowerCase();
  const [lead, portal, signed, checks] = await Promise.all([
    a.leadId
      ? q<{ id: string; name: string; tag: string; r2_key: string; at: Date }>(
          `SELECT id, name, tag, r2_key, at FROM os_lead_documents WHERE lead_id = $1 ORDER BY at DESC`,
          [a.leadId]
        ).catch(() => [])
      : Promise.resolve([]),
    /* The landlord's own uploads: those made against this appraisal, and
       their ID and ownership papers from the portal, which are theirs, not one home's. */
    q<{ id: string; kind: string; name: string; r2_key: string; uploaded_at: Date }>(
      `SELECT d.id, d.kind, d.name, d.r2_key, d.uploaded_at
         FROM os_landlord_documents d
         LEFT JOIN os_portal_accounts p ON p.id = d.account_id
        WHERE d.appraisal_id = $1
           OR ($2 <> '' AND d.appraisal_id IS NULL AND d.kind IN ('id', 'ownership') AND lower(p.email) = $2)
        ORDER BY d.uploaded_at DESC`,
      [a.id, email]
    ).catch(() => []),
    q<{ submitter_id: string; template_name: string; signer_name: string; r2_key: string; completed_at: Date }>(
      `SELECT submitter_id, template_name, signer_name, r2_key, completed_at FROM os_signed_documents
        WHERE appraisal_id = $1 AND completed_at IS NOT NULL AND r2_key <> '' ORDER BY completed_at DESC`,
      [a.id]
    ).catch(() => []),
    a.leadId
      ? q<{ id: string; person_name: string; doc_type: string; file_key: string; checked_by_name: string; checked_at: Date }>(
          `SELECT id, person_name, doc_type, file_key, checked_by_name, checked_at FROM os_id_checks
            WHERE lead_id = $1 AND file_key <> '' ORDER BY checked_at DESC`,
          [a.leadId]
        ).catch(() => [])
      : Promise.resolve([]),
  ]);

  const out: AppraisalPaper[] = [];
  for (const d of lead) {
    const type = LEAD_TAG_TYPE[d.tag] ?? DOC_TYPES.find((t) => t.label === d.tag)?.key ?? "other";
    out.push({ key: `lead:${d.id}`, type, label: type === "other" ? d.tag || "Document" : labelOf(type, d.tag), name: d.name, at: iso(d.at), how: "Uploaded on the lead", r2Key: d.r2_key });
  }
  for (const d of portal) {
    const type = PORTAL_KIND_TYPE[d.kind] ?? "other";
    out.push({ key: `portal:${d.id}`, type, label: type === "other" ? "From the landlord" : labelOf(type, d.kind), name: d.name || "Document", at: iso(d.uploaded_at), how: "Sent through the landlord portal", r2Key: d.r2_key });
  }
  for (const d of signed) {
    out.push({
      key: `signed:${d.submitter_id}`,
      type: "terms_of_business",
      label: labelOf("terms_of_business", "Terms of Business"),
      name: `${text(d.template_name) ?? "Terms of business"}.pdf`,
      at: iso(d.completed_at),
      how: text(d.signer_name) ? `Signed online by ${d.signer_name.trim()}` : "Signed online",
      r2Key: d.r2_key,
    });
  }
  for (const c of checks) {
    out.push({
      key: `idcheck:${c.id}`,
      type: "landlord_id",
      label: labelOf("landlord_id", "Landlord ID"),
      name: `${c.doc_type || "ID"} - ${c.person_name}`,
      at: iso(c.checked_at),
      how: text(c.checked_by_name) ? `Checked by ${c.checked_by_name.trim()}` : "ID check",
      r2Key: c.file_key,
    });
  }
  return out.sort((x, y) => (y.at ?? "").localeCompare(x.at ?? ""));
}

/** Everything the appraisal behind a home holds, or null when there is none. */
export async function appraisalDossierForHome(home: { propertyId?: string | null; address?: string | null }): Promise<AppraisalDossier | null> {
  const a = await appraisalForHome(home);
  if (!a) return null;
  const [facts, notes, papers] = await Promise.all([factsOf(a).catch(() => []), notesOf(a).catch(() => []), papersOf(a).catch(() => [])]);
  return { ...a, facts, notes, papers };
}
