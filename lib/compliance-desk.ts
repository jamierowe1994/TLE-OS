import "server-only";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { hasDb, q } from "@/lib/db";
import { DOC_KINDS } from "@/lib/landlord-account";
import { readable, readsFor, REGISTERS, type RegisterRead } from "@/lib/cert-register";
import { heldComplianceBook } from "@/lib/compliance-cache";
import { fileCertificate, PLAUSIBLE, YMD, shareOnceChecked } from "@/lib/certificate-intake";
import { pendingKeyFor } from "@/lib/property-match";
import { R2_BUCKET, r2Configured, withR2 } from "@/lib/r2";
import { documentQueriedEmail } from "@/lib/email/agent-emails";
import { ResendBlocked, sendEmail } from "@/lib/resend";

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
 * agent." So nothing here writes to a landlord. A query is a note on the
 * record, and since 4 Oct 2026 (compliance going live) it is also an email to
 * the agent on the home with his words in it, and a line in their bell. His
 * Verified on a certificate is what lets it go on to the landlord and tenants
 * (lib/certificate-intake, shareOnceChecked), behind its own switch.
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
  door: "Agent" | "Contractor" | "Landlord" | "REX";
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
  /** `told`: the agent the query was emailed to, when it was. */
  queried: { note: string; by: string; at: string; told?: string | null } | null;
  /** A landlord's upload that is a certificate: verified, it is filed as one,
   *  so it needs the expiry date, and the type where the kind covers several. */
  fileAs?: { types: { id: string; label: string }[] } | null;
  /** Gas and electrical only: the engineer's register check (lib/cert-register).
   *  `read` is null until the certificate has been read. */
  register?: { read: RegisterRead | null; registerName: string | null; registerUrl: string | null };
}

const ymd = (v: unknown) => (v ? (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10)) : null);
const isoOf = (v: unknown) => new Date(v as string).toISOString();

function doorOf(source: string): VerifyItem["door"] {
  const s = source.toLowerCase();
  /* Filed on REX (or REX PM) and picked up by the OS - see feedRexRenewals. */
  if (/\brex\b/.test(s)) return "REX";
  if (s.includes("contractor")) return "Contractor";
  if (s.includes("landlord")) return "Landlord";
  return "Agent";
}

/** Everything waiting on him, oldest first: the oldest is the one nearest its 30 days. */
export async function verifyQueue(): Promise<VerifyItem[]> {
  if (!hasDb()) return [];
  const [certs, docs] = await Promise.all([
    q<Record<string, unknown>>(
      `SELECT c.id, c.property_name, c.type_id AS type_raw, c.type_id, c.expiry, c.name, c.r2_key, c.source, c.added_by, c.added_at,
              k.state, k.note, k.by_name, k.at AS checked_at, k.told, k.told_at, tu.name AS told_name
         FROM os_certificates c
         LEFT JOIN os_compliance_checks k ON k.kind = 'certificate' AND k.subject_id = c.id
         LEFT JOIN os_users tu ON tu.id = k.told
        WHERE c.added_at >= $1::date AND (k.state IS NULL OR k.state <> 'verified')
        ORDER BY c.added_at`,
      [CHECKS_BEGAN]
    ),
    q<Record<string, unknown>>(
      `SELECT d.id, d.kind AS type_raw, d.kind, d.name, d.r2_key, d.uploaded_at, a.name AS landlord, m.address, m.postcode, m.agent,
              k.state, k.note, k.by_name, k.at AS checked_at, k.told, k.told_at, tu.name AS told_name
         FROM os_landlord_documents d
         JOIN os_portal_accounts a ON a.id = d.account_id
         LEFT JOIN os_market_appraisals m ON m.id = d.appraisal_id
         LEFT JOIN os_compliance_checks k ON k.kind = 'landlord_document' AND k.subject_id = d.id
         LEFT JOIN os_users tu ON tu.id = k.told
        WHERE d.uploaded_at >= $1::date AND d.kind <> ALL($2::text[]) AND (k.state IS NULL OR k.state <> 'verified')
        ORDER BY d.uploaded_at`,
      [CHECKS_BEGAN, NOT_HIS]
    ),
  ]);

  const queried = (r: Record<string, unknown>) =>
    r.state === "queried" ? { note: String(r.note ?? ""), by: String(r.by_name ?? ""), at: isoOf(r.checked_at), told: r.told_at ? String(r.told_name ?? "") || null : null } : null;

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
      agent: ["Agent", "REX"].includes(doorOf(String(r.source ?? ""))) ? String(r.added_by ?? "") || null : null,
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
      fileAs: LANDLORD_CERT_TYPES[String(r.kind)] ? { types: LANDLORD_CERT_TYPES[String(r.kind)] } : null,
    })),
  ];
  /* The engineer's register check on every gas and electrical one. */
  const rawType = new Map<string, string>([
    ...certs.map((r) => [`certificate:${r.id}`, String(r.type_raw ?? "")] as [string, string]),
    ...docs.map((r) => [`landlord_document:${r.id}`, String(r.type_raw ?? "")] as [string, string]),
  ]);
  const wanted = out.filter((i) => readable(i.kind, rawType.get(`${i.kind}:${i.id}`) ?? ""));
  const reads = await readsFor(wanted).catch(() => new Map<string, RegisterRead>());
  for (const i of wanted) {
    const read = reads.get(`${i.kind}:${i.id}`) ?? null;
    const reg = read && read.scheme !== "none" ? REGISTERS[read.scheme] : null;
    const gas = /gas/.test(rawType.get(`${i.kind}:${i.id}`) ?? "");
    /* Not read yet: the register it will almost certainly be, so the button is there from the start. */
    const fallback = gas ? REGISTERS.gas_safe : null;
    i.register = { read, registerName: (reg ?? fallback)?.name ?? null, registerUrl: (reg ?? fallback)?.url ?? null };
  }
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

/**
 * What a landlord's upload is filed as, once it is checked. The kinds the
 * portal asks for, mapped to the certificate types the book counts. Photo ID,
 * ownership, consent and the like are documents, not certificates, and are
 * simply ticked.
 */
const LANDLORD_CERT_TYPES: Record<string, { id: string; label: string }[]> = {
  gas: [{ id: "gas_safety", label: "Gas safety (CP12)" }],
  eicr: [{ id: "eicr", label: "EICR" }],
  epc: [{ id: "epc", label: "EPC" }],
  licence: [
    { id: "mandatory_hmo_license", label: "Mandatory HMO licence" },
    { id: "additional_hmo_license", label: "Additional HMO licence" },
    { id: "selective_hmo_license", label: "Selective licence" },
  ],
  fire: [{ id: "emergency_lighting_fire_exit", label: "Fire safety" }],
  pat: [{ id: "portable_appliance_testing", label: "PAT" }],
  alarms: [
    { id: "smoke_alarms", label: "Smoke alarms" },
    { id: "co_alarms", label: "CO alarms" },
  ],
  legionella: [{ id: "legionella_risk_assessment", label: "Legionella risk assessment" }],
};

/**
 * A landlord's certificate, checked: filed as a real certificate.
 *
 * Before 4 Oct 2026 his tick on a landlord's upload was only a tick - no
 * expiry, nothing in REX, the home's figures unmoved - so a landlord could
 * send the gas certificate and the home still read "no record". Now the same
 * intake every other door uses files it: R2 vault, os_certificates, REX (or
 * held against the address until the home has a REX property), and it is
 * already checked, so it goes on to anyone entitled to it.
 */
async function fileLandlordCertificate(p: { id: string; type: string; expiry: string; issue?: string | null; by: string }): Promise<string> {
  const rows = await q<Record<string, unknown>>(
    `SELECT d.id, d.kind, d.name, d.r2_key, d.content_type, d.certificate_id, a.name AS landlord, m.address, m.postcode, m.rex_property_id
       FROM os_landlord_documents d
       JOIN os_portal_accounts a ON a.id = d.account_id
       LEFT JOIN os_market_appraisals m ON m.id = d.appraisal_id
      WHERE d.id = $1`,
    [p.id]
  );
  const d = rows[0];
  if (!d) throw new Error("That document is not there any more.");
  if (d.certificate_id) return "Already filed as a certificate.";
  const address = [d.address, d.postcode].map((v) => String(v ?? "").trim()).filter(Boolean).join(", ");
  const propertyId = String(d.rex_property_id ?? "").trim() || (address ? pendingKeyFor(address) : "");
  if (!propertyId) throw new Error("This document is not tied to a property, so it cannot be filed as a certificate. Ask the agent which home it is for.");
  if (!r2Configured) throw new Error("File storage is not set up on this environment, so the certificate cannot be filed here.");
  let bytes: Uint8Array | undefined;
  try {
    const obj = await withR2((c) => c.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: String(d.r2_key) })));
    bytes = await obj.Body?.transformToByteArray();
  } catch {
    bytes = undefined;
  }
  if (!bytes) throw new Error("The landlord's file could not be read back from storage, so it was not filed. Try again in a minute.");
  const filed = await fileCertificate({
    bytes,
    fileName: String(d.name ?? "") || `${p.type}.pdf`,
    contentType: String(d.content_type ?? "") || "application/pdf",
    propertyId,
    propertyName: address,
    type: p.type,
    expiry: p.expiry,
    issue: p.issue || null,
    source: "uploaded in the landlord portal",
    by: String(d.landlord ?? "") || "The landlord",
    checkedBy: p.by,
  });
  await q(`UPDATE os_landlord_documents SET certificate_id = $2 WHERE id = $1`, [p.id, filed.row.id]);
  const where = propertyId.startsWith("pending-") ? "Filed against the address until the home is set up." : "Filed on the home.";
  return [where, filed.share?.line].filter(Boolean).join(" ");
}

/**
 * The agent on the thing he queried, and where they can put it right.
 *
 * A certificate's home names its agent in the compliance book (the agent on
 * its latest listing). Read from what is HELD, never a fresh walk of REX - his
 * click must not wait minutes. A landlord's upload names the appraisal's
 * agent. Either way the name is matched to an OS login; failing that, the
 * person who filed it, if they have one.
 */
async function agentFor(kind: "certificate" | "landlord_document", id: string): Promise<{
  agent: { id: string; name: string; email: string } | null;
  agentName: string | null;
  property: string;
  what: string;
  fileName: string;
  link: string;
}> {
  const ORIGIN = (process.env.OS_PUBLIC_URL || process.env.OS_ORIGIN || "https://tle-os.co.uk").replace(/\/+$/, "");
  const userByName = async (name: string | null) => {
    if (!name?.trim()) return null;
    const rows = await q<{ id: string; name: string; email: string }>(
      `SELECT id, name, email FROM os_users WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) AND email <> '' ORDER BY (role = 'agent') DESC LIMIT 1`,
      [name]
    ).catch(() => []);
    return rows[0] ?? null;
  };
  if (kind === "certificate") {
    const rows = await q<Record<string, unknown>>(`SELECT property_id, property_name, type_id, name, added_by FROM os_certificates WHERE id = $1`, [id]);
    const c = rows[0] ?? {};
    const propertyId = String(c.property_id ?? "");
    const held = await heldComplianceBook().catch(() => null);
    const home = held?.book.properties.find((p) => p.id === propertyId) ?? null;
    const agentName = home?.agent?.trim() || null;
    const agent = (await userByName(agentName)) ?? (await userByName(String(c.added_by ?? "")));
    return {
      agent,
      agentName: agentName ?? (String(c.added_by ?? "") || null),
      property: String(c.property_name ?? "") || "a property",
      what: TYPE_WORDS[String(c.type_id)] ?? String(c.type_id ?? "certificate"),
      fileName: String(c.name ?? ""),
      link: /^\d+$/.test(propertyId) || /^pm-/i.test(propertyId) ? `${ORIGIN}/compliance?open=${encodeURIComponent(propertyId)}` : `${ORIGIN}/compliance`,
    };
  }
  const rows = await q<Record<string, unknown>>(
    `SELECT d.kind, d.name, d.appraisal_id, m.address, m.postcode, m.agent
       FROM os_landlord_documents d LEFT JOIN os_market_appraisals m ON m.id = d.appraisal_id WHERE d.id = $1`,
    [id]
  );
  const d = rows[0] ?? {};
  const agentName = d.agent ? String(d.agent) : null;
  return {
    agent: await userByName(agentName),
    agentName,
    property: [d.address, d.postcode].map((v) => String(v ?? "").trim()).filter(Boolean).join(", ") || "a property",
    what: DOC_KINDS.find((k) => k.id === d.kind)?.label ?? "Document",
    fileName: String(d.name ?? ""),
    link: d.appraisal_id ? `${ORIGIN}/market-appraisals/${encodeURIComponent(String(d.appraisal_id))}` : `${ORIGIN}/market-appraisals`,
  };
}

/**
 * His query, sent to the agent. One sentence back for his screen, true either
 * way: who was emailed, or why nobody was.
 */
async function tellAgent(kind: "certificate" | "landlord_document", id: string, note: string, by: string): Promise<string> {
  const a = await agentFor(kind, id);
  if (!a.agent) {
    return a.agentName
      ? `Nobody was emailed: ${a.agentName} has no TLE OS login. Take it up with them yourself.`
      : "Nobody was emailed: this home has no agent on record. Take it up with whoever looks after it.";
  }
  const mail = documentQueriedEmail({
    firstName: a.agent.name.split(/\s+/)[0] || "there",
    property: a.property,
    what: a.what,
    fileName: a.fileName,
    note,
    by,
    link: a.link,
  });
  try {
    await sendEmail({ to: a.agent.email, subject: mail.subject, html: mail.html, text: mail.text });
  } catch (e) {
    const why = (e instanceof ResendBlocked ? e.message : e instanceof Error ? e.message : "it failed").replace(/\.+$/, "");
    return `Saved, but the email to ${a.agent.name} did not go: ${why}.`;
  }
  await q(`UPDATE os_compliance_checks SET told = $3, told_at = NOW() WHERE kind = $1 AND subject_id = $2`, [kind, id, a.agent.id]);
  return `Emailed ${a.agent.name}, and it is in their notifications.`;
}

/** Queries on documents an agent was told about and that are still open: their bell. */
export async function queriesFor(userId: string): Promise<{ kind: string; id: string; note: string; by: string; at: string; property: string; what: string; link: string }[]> {
  if (!hasDb()) return [];
  const rows = await q<Record<string, unknown>>(
    `SELECT k.kind, k.subject_id, k.note, k.by_name, k.told_at,
            c.property_name, c.property_id, c.type_id, d.kind AS doc_kind, d.appraisal_id, m.address
       FROM os_compliance_checks k
       LEFT JOIN os_certificates c ON k.kind = 'certificate' AND c.id = k.subject_id
       LEFT JOIN os_landlord_documents d ON k.kind = 'landlord_document' AND d.id = k.subject_id
       LEFT JOIN os_market_appraisals m ON m.id = d.appraisal_id
      WHERE k.state = 'queried' AND k.told = $1 AND k.told_at > NOW() - INTERVAL '30 days'
      ORDER BY k.told_at DESC LIMIT 20`,
    [userId]
  ).catch(() => []);
  return rows.map((r) => ({
    kind: String(r.kind),
    id: String(r.subject_id),
    note: String(r.note ?? ""),
    by: String(r.by_name ?? ""),
    at: isoOf(r.told_at),
    property: String(r.property_name ?? r.address ?? "") || "A property",
    what: r.kind === "certificate" ? TYPE_WORDS[String(r.type_id)] ?? String(r.type_id ?? "") : DOC_KINDS.find((k) => k.id === r.doc_kind)?.label ?? "Document",
    link: r.kind === "certificate" ? `/compliance?open=${encodeURIComponent(String(r.property_id ?? ""))}` : r.appraisal_id ? `/market-appraisals/${encodeURIComponent(String(r.appraisal_id))}` : "/market-appraisals",
  }));
}

/**
 * His answer, and everything that follows from it. One sentence back for his
 * screen about what happened next.
 *
 *   Verified, a certificate        it goes on to the landlord and tenants
 *   Verified, a landlord's cert    filed as a real certificate first (needs the expiry)
 *   Queried                        the agent is emailed his note
 */
export async function answer(p: {
  kind: CheckKind;
  id: string;
  state: CheckState;
  note?: string;
  by: string;
  fileAs?: { type: string; expiry: string; issue?: string | null } | null;
}): Promise<string> {
  if (p.state === "verified" && p.kind === "landlord_document") {
    const kinds = await q<{ kind: string }>(`SELECT kind FROM os_landlord_documents WHERE id = $1`, [p.id]);
    const types = LANDLORD_CERT_TYPES[kinds[0]?.kind ?? ""];
    if (types) {
      const f = p.fileAs;
      if (!f?.expiry || !PLAUSIBLE(f.expiry)) throw new Error("Put the date it runs out in first, so it can be filed as a certificate.");
      if (f.issue && !YMD.test(f.issue)) throw new Error("The issue date needs to be a date.");
      const type = types.some((t) => t.id === f.type) ? f.type : types[0].id;
      const said = await fileLandlordCertificate({ id: p.id, type, expiry: f.expiry, issue: f.issue ?? null, by: p.by });
      await recordCheck(p);
      return said;
    }
  }
  await recordCheck(p);
  if (p.state === "verified" && p.kind === "certificate") {
    const share = await shareOnceChecked(p.id).catch(() => null);
    return share?.line ?? "";
  }
  if (p.state === "queried" && p.kind !== "works_order") {
    return tellAgent(p.kind, p.id, (p.note ?? "").trim(), p.by).catch((e) => `Saved, but the agent was not told: ${e instanceof Error ? e.message : "it failed"}.`);
  }
  return "";
}

/** His tick, or his query. A second look replaces the first. */
export async function recordCheck(p: { kind: CheckKind; id: string; state: CheckState; note?: string; by: string }): Promise<void> {
  await q(
    `INSERT INTO os_compliance_checks (kind, subject_id, state, note, by_name) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (kind, subject_id) DO UPDATE SET state = EXCLUDED.state, note = EXCLUDED.note, by_name = EXCLUDED.by_name, at = NOW(), told = '', told_at = NULL`,
    [p.kind, p.id, p.state, (p.note ?? "").trim().slice(0, 600), p.by]
  );
}

/** Does the thing being checked exist? A tick against nothing is a row nobody can explain later. */
export async function subjectExists(kind: CheckKind, id: string): Promise<boolean> {
  const table = kind === "certificate" ? "os_certificates" : kind === "landlord_document" ? "os_landlord_documents" : "os_works_orders";
  const rows = await q<{ id: string }>(`SELECT id FROM ${table} WHERE id = $1`, [id]);
  return rows.length > 0;
}
