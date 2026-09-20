import "server-only";
import { hasDb, q } from "@/lib/db";
import { DOC_KINDS } from "@/lib/landlord-account";

/**
 * MICHAEL'S DESK. The three lists that are his and nobody else's.
 *
 * James, 20 Sep 2026: "Michael covers all of the compliance for the company...
 * His main job is to make sure: the properties are all compliant, so anything
 * that's overdue is massively important; all of the new files are onto the
 * systems when the landlord, contractor, or agent uploads them, and that they
 * get verified and taken off the list; all of the agents are compliant... The
 * last thing that he does is check on works orders."
 *
 * The first and the third already had a screen each (lib/compliance-tracker,
 * lib/agent-compliance). This is the other two, which had none:
 *
 *   TO VERIFY     every document that has come in by any door and that he has
 *                 not yet looked at. Verified, it leaves the list. Queried, it
 *                 stays, with what is wrong written on it.
 *   WORKS ORDERS  every finished job he has not yet checked. He is told at the
 *                 back end of a job (pingCompliance, when it is marked done) -
 *                 this is the list that email points at.
 *
 * ── He never writes to a landlord ─────────────────────────────────────────
 *
 * "He doesn't email the landlords direct... He will always go through the
 * agent." So nothing here sends anything to anybody. A query is a note on the
 * record and the name of the agent to take it up with; the conversation is his.
 *
 * ── Three doors, two tables ───────────────────────────────────────────────
 *
 * An agent's upload and a contractor's both land in os_certificates (see
 * lib/certificate-intake). A landlord's, from their portal, lands in
 * os_landlord_documents, because at take-on there is often no REX property to
 * hang a certificate on yet. The queue reads both and says which door.
 *
 * ── Why the list does not start with 2,436 on it ──────────────────────────
 *
 * Everything in os_certificates before CHECKS_BEGAN is the Propoly backlog,
 * loaded in bulk on 5 Sep and read against the paper at the time. Asking him to
 * tick each of them would bury the six that arrive this week. This is a
 * cut-over date, not a month scope: it never moves.
 */
export const CHECKS_BEGAN = "2026-09-20";

export type CheckKind = "certificate" | "landlord_document" | "works_order";
export type CheckState = "verified" | "queried";
export const isCheckKind = (v: string): v is CheckKind => v === "certificate" || v === "landlord_document" || v === "works_order";

const TYPE_WORDS: Record<string, string> = {
  gas_safety: "Gas safety (CP12)",
  eicr: "EICR",
  epc: "EPC",
  mandatory_hmo_license: "HMO licence",
  additional_hmo_license: "HMO licence (additional)",
  selective_hmo_license: "Selective licence",
  legionella_risk_assessment: "Legionella risk assessment",
  portable_appliance_testing: "PAT",
  smoke_alarms: "Smoke alarms",
  co_alarms: "CO alarms",
  emergency_lighting_fire_exit: "Fire safety",
};

/** Identity and ownership are the agent's take-on checks, not a certificate. */
const NOT_HIS = ["id", "ownership", "other"];

export interface VerifyItem {
  kind: "certificate" | "landlord_document";
  id: string;
  door: "Agent" | "Contractor" | "Landlord";
  property: string;
  /** "Gas safety (CP12)". */
  what: string;
  /** YYYY-MM-DD, where the record carries one. A landlord's upload does not. */
  expiry: string | null;
  fileName: string;
  /** R2 key, opened through /api/r2/file. */
  fileKey: string;
  /** Who filed it, in the record's own words. */
  by: string;
  /** Where it came from, in the record's own words. */
  source: string;
  /** Who to take a problem up with. Null when the record does not say. */
  agent: string | null;
  addedAt: string;
  queried: { note: string; by: string; at: string } | null;
}

const ymd = (v: unknown) => (v ? (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10)) : null);
const isoOf = (v: unknown) => new Date(v as string).toISOString();

function doorOf(source: string): VerifyItem["door"] {
  const s = source.toLowerCase();
  if (s.includes("contractor")) return "Contractor";
  if (s.includes("landlord")) return "Landlord";
  return "Agent";
}

/** Everything waiting on him, oldest first: the oldest is the one nearest its 30 days. */
export async function verifyQueue(): Promise<VerifyItem[]> {
  if (!hasDb()) return [];
  const [certs, docs] = await Promise.all([
    q<Record<string, unknown>>(
      `SELECT c.id, c.property_name, c.type_id, c.expiry, c.name, c.r2_key, c.source, c.added_by, c.added_at,
              k.state, k.note, k.by_name, k.at AS checked_at
         FROM os_certificates c
         LEFT JOIN os_compliance_checks k ON k.kind = 'certificate' AND k.subject_id = c.id
        WHERE c.added_at >= $1::date AND (k.state IS NULL OR k.state <> 'verified')
        ORDER BY c.added_at`,
      [CHECKS_BEGAN]
    ),
    q<Record<string, unknown>>(
      `SELECT d.id, d.kind, d.name, d.r2_key, d.uploaded_at, a.name AS landlord, m.address, m.postcode, m.agent,
              k.state, k.note, k.by_name, k.at AS checked_at
         FROM os_landlord_documents d
         JOIN os_portal_accounts a ON a.id = d.account_id
         LEFT JOIN os_market_appraisals m ON m.id = d.appraisal_id
         LEFT JOIN os_compliance_checks k ON k.kind = 'landlord_document' AND k.subject_id = d.id
        WHERE d.uploaded_at >= $1::date AND d.kind <> ALL($2::text[]) AND (k.state IS NULL OR k.state <> 'verified')
        ORDER BY d.uploaded_at`,
      [CHECKS_BEGAN, NOT_HIS]
    ),
  ]);

  const queried = (r: Record<string, unknown>) =>
    r.state === "queried" ? { note: String(r.note ?? ""), by: String(r.by_name ?? ""), at: isoOf(r.checked_at) } : null;

  const out: VerifyItem[] = [
    ...certs.map((r): VerifyItem => ({
      kind: "certificate",
      id: String(r.id),
      door: doorOf(String(r.source ?? "")),
      property: String(r.property_name ?? "") || "A property with no name on the record",
      what: TYPE_WORDS[String(r.type_id)] ?? String(r.type_id),
      expiry: ymd(r.expiry),
      fileName: String(r.name ?? ""),
      fileKey: String(r.r2_key ?? ""),
      by: String(r.added_by ?? ""),
      source: String(r.source ?? ""),
      agent: doorOf(String(r.source ?? "")) === "Agent" ? String(r.added_by ?? "") || null : null,
      addedAt: isoOf(r.added_at),
      queried: queried(r),
    })),
    ...docs.map((r): VerifyItem => ({
      kind: "landlord_document",
      id: String(r.id),
      door: "Landlord",
      property: [r.address, r.postcode].map((v) => String(v ?? "").trim()).filter(Boolean).join(", ") || "Not tied to a property yet",
      what: DOC_KINDS.find((k) => k.id === r.kind)?.label ?? String(r.kind),
      expiry: null,
      fileName: String(r.name ?? ""),
      fileKey: String(r.r2_key ?? ""),
      by: String(r.landlord ?? "") || "The landlord",
      source: "uploaded in the landlord portal",
      agent: r.agent ? String(r.agent) : null,
      addedAt: isoOf(r.uploaded_at),
      queried: queried(r),
    })),
  ];
  return out.sort((a, b) => (a.addedAt < b.addedAt ? -1 : 1));
}

export interface WorksCheckItem {
  id: string;
  ref: number;
  kind: string;
  status: string;
  property: string;
  title: string;
  category: string;
  contractor: string;
  raisedBy: string;
  completedAt: string;
  completionNote: string;
  files: { key: string; name: string; type: string }[];
  queried: { note: string; by: string; at: string } | null;
}

/**
 * Finished jobs he has not yet checked.
 *
 * "He would need to be notified towards the back end of that process." The
 * back end is done: the work is finished and whatever it produced is on the
 * job. Rehearsals are left out - invented people, and nothing to put right.
 */
export async function worksToCheck(): Promise<WorksCheckItem[]> {
  if (!hasDb()) return [];
  const rows = await q<Record<string, unknown>>(
    `SELECT o.id, o.ref, o.kind, o.status, o.property_name, o.locality, o.title, o.category, o.contractor_name,
            o.raised_by, o.completed_at, o.completion_note, o.files,
            k.state, k.note, k.by_name, k.at AS checked_at
       FROM os_works_orders o
       LEFT JOIN os_compliance_checks k ON k.kind = 'works_order' AND k.subject_id = o.id
      WHERE o.completed_at IS NOT NULL AND o.status <> 'cancelled' AND NOT o.rehearsal
        AND (k.state IS NULL OR k.state <> 'verified')
      ORDER BY o.completed_at`
  );
  return rows.map((r) => ({
    id: String(r.id),
    ref: Number(r.ref ?? 0),
    kind: String(r.kind ?? ""),
    status: String(r.status ?? ""),
    property: [r.property_name, r.locality].map((v) => String(v ?? "").trim()).filter(Boolean).join(", "),
    title: String(r.title ?? ""),
    category: String(r.category ?? ""),
    contractor: String(r.contractor_name ?? ""),
    raisedBy: String(r.raised_by ?? ""),
    completedAt: isoOf(r.completed_at),
    completionNote: String(r.completion_note ?? ""),
    files: Array.isArray(r.files) ? (r.files as { key: string; name: string; type: string }[]).map((f) => ({ key: f.key, name: f.name, type: f.type })) : [],
    queried: r.state === "queried" ? { note: String(r.note ?? ""), by: String(r.by_name ?? ""), at: isoOf(r.checked_at) } : null,
  }));
}

/** His tick, or his query. A second look replaces the first. */
export async function recordCheck(p: { kind: CheckKind; id: string; state: CheckState; note?: string; by: string }): Promise<void> {
  await q(
    `INSERT INTO os_compliance_checks (kind, subject_id, state, note, by_name) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (kind, subject_id) DO UPDATE SET state = EXCLUDED.state, note = EXCLUDED.note, by_name = EXCLUDED.by_name, at = NOW()`,
    [p.kind, p.id, p.state, (p.note ?? "").trim().slice(0, 600), p.by]
  );
}

/** Does the thing being checked exist? A tick against nothing is a row nobody can explain later. */
export async function subjectExists(kind: CheckKind, id: string): Promise<boolean> {
  const table = kind === "certificate" ? "os_certificates" : kind === "landlord_document" ? "os_landlord_documents" : "os_works_orders";
  const rows = await q<{ id: string }>(`SELECT id FROM ${table} WHERE id = $1`, [id]);
  return rows.length > 0;
}
