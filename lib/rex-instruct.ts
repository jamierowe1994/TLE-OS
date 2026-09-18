import "server-only";
import { hasDb, q } from "@/lib/db";
import { getAppraisal, recordValuation } from "@/lib/appraisal-store";
import { getContact, markRex } from "@/lib/contacts-store";
import { isOsLead, osContactIdFrom } from "@/lib/contacts-as-leads";
import { pushContactToRex } from "@/lib/rex-contacts";
import { createProperty } from "@/lib/rex-properties";
import { matchProperty, postcodeOf } from "@/lib/property-match";
import { signedFor } from "@/lib/signed-documents";
import { isTestFile, TEST_REFUSAL } from "@/lib/test-guard";

/**
 * SIGNED TERMS PUT THE LANDLORD AND THE HOME INTO REX (James, 18 Sep 2026).
 *
 * "Once this launches, there will be no file ever created in REX ... the OS
 * would have to create the file in REX ... if I create someone and then I get
 * all the way down to the listing and it's not actually connected into REX,
 * then that's going to be a bit of a problem."
 *
 * So the moment the landlord signs, the OS makes sure REX has:
 *   1. the landlord, as a contact (pushed if the OS has not already);
 *   2. the home, as a property with the landlord joined as its owner - or the
 *      one REX already holds at that address, so a returning home is never
 *      made twice;
 * and writes the property's id onto the appraisal, so the listing, the
 * certificates and the signed contract all have somewhere to go.
 *
 * Runs from the DocuSeal webhook when the contract comes back, and again from
 * the five-minute cron for any signed file still without a REX property (the
 * agent had not linked REX yet, REX was down), at most once an hour each.
 * Test files never: they stay in the OS (lib/test-guard).
 *
 * Written down in os_case_state 'rex-instruct', keyed by the appraisal.
 */

const KIND = "rex-instruct";

export interface InstructRecord {
  ok: boolean;
  contactId: string | null;
  propertyId: string | null;
  /** What happened, in words an owner can read. */
  detail: string;
  at: string;
}

export async function instructRecord(appraisalId: string): Promise<InstructRecord | null> {
  if (!hasDb()) return null;
  const rows = await q<{ payload: InstructRecord }>(`SELECT payload FROM os_case_state WHERE kind = $1 AND record_id = $2`, [KIND, appraisalId]).catch(() => []);
  return rows[0]?.payload ?? null;
}

async function remember(appraisalId: string, rec: InstructRecord, by: string) {
  await q(
    `INSERT INTO os_case_state (kind, record_id, payload, updated_at, updated_by)
     VALUES ($1, $2, $3::jsonb, NOW(), $4)
     ON CONFLICT (kind, record_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
    [KIND, appraisalId, JSON.stringify(rec), by]
  ).catch(() => null);
}

/** The agent on the file, as an OS user, so REX records them as the creator. */
async function agentUserId(agent: string | null, fallback: string | null): Promise<string | null> {
  const key = (agent ?? "").trim().toLowerCase();
  if (key) {
    const rows = await q<{ id: string }>(
      `SELECT u.id FROM os_users u JOIN os_rex_tokens t ON t.user_id = u.id
        WHERE lower(trim(u.name)) = $1 OR lower(u.email) = $1 LIMIT 1`,
      [key]
    ).catch(() => []);
    if (rows[0]) return rows[0].id;
  }
  return fallback;
}

/**
 * "Flat 2, 10 High Street, Didsbury, Manchester" → the pieces REX stores.
 * The numbered line is the street; anything before it (a flat, a house name)
 * goes in front of the number; the last line left is the town.
 */
export function splitAddress(address: string, postcode: string | null) {
  const pc = (postcode || postcodeOf(address) || "").toUpperCase();
  const parts = address
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && postcodeOf(s) !== s.toUpperCase().replace(/\s+/g, " "))
    .map((s) => (pc ? s.replace(new RegExp(`\\s*${pc.replace(/\s+/g, "\\s*")}\\s*$`, "i"), "").trim() : s))
    .filter(Boolean);
  const at = parts.findIndex((s) => /^\d+[a-z]?(\s*-\s*\d+[a-z]?)?\s+\S/i.test(s));
  if (at < 0) {
    /* "Rose Cottage, Mill Lane, Stockport": the name, then the street. */
    return parts.length >= 3
      ? { streetNumber: parts[0], streetName: parts[1], town: parts[parts.length - 1], postcode: pc }
      : { streetNumber: "", streetName: parts[0] ?? "", town: parts.length > 1 ? parts[parts.length - 1] : "", postcode: pc };
  }
  const m = parts[at].match(/^(\d+[a-z]?(?:\s*-\s*\d+[a-z]?)?)\s+(.+)$/i)!;
  const before = parts.slice(0, at).join(", ");
  const after = parts.slice(at + 1);
  /* "Flat 3" is REX's unit field; a house name stays in front of the number. */
  const unit = /^(flat|apartment|apt|unit|room|studio)\b/i.test(before) ? before : "";
  return {
    unitNumber: unit || null,
    streetNumber: before && !unit ? `${before}, ${m[1]}` : m[1],
    streetName: m[2],
    town: after.length ? after[after.length - 1] : "",
    postcode: pc,
  };
}

/** The landlord's REX contact: the one the OS already pushed, else push them now. */
async function landlordInRex(leadId: string | null, userId: string | null, by: string): Promise<{ id: string | null; note: string }> {
  if (!leadId) return { id: null, note: "No lead behind the appraisal, so the property has no owner joined yet." };
  if (isOsLead(leadId)) {
    const c = await getContact(osContactIdFrom(leadId));
    if (!c) return { id: null, note: "The landlord's contact could not be found." };
    if (c.rexId) return { id: c.rexId, note: "" };
    const pushed = await pushContactToRex(c, userId);
    if (!pushed.ok) {
      const state = pushed.reason === "refused" || pushed.reason === "rex_session_expired" ? "failed" : "held";
      await markRex(c.id, state, pushed.detail, null, by).catch(() => null);
      return { id: null, note: `Landlord not in REX: ${pushed.detail}` };
    }
    await markRex(c.id, "sent", pushed.detail, pushed.rexId, by).catch(() => null);
    return { id: pushed.rexId, note: "" };
  }
  /* A REX lead: its contact is already in REX. */
  const rows = await q<{ contact_id: string | null }>(`SELECT contact_id FROM os_leads WHERE id = $1 OR id = $2 LIMIT 1`, [leadId, `rex-${leadId}`]).catch(() => []);
  return { id: rows[0]?.contact_id || null, note: rows[0]?.contact_id ? "" : "The lead has no REX contact on it." };
}

export async function putInstructionInRex(appraisalId: string, opts: { userId?: string | null; by?: string } = {}): Promise<InstructRecord> {
  const by = opts.by ?? "automatic";
  const at = new Date().toISOString();
  const ma = await getAppraisal(appraisalId);
  if (!ma) return { ok: false, contactId: null, propertyId: null, detail: "No such appraisal.", at };

  if (await isTestFile({ appraisalId: ma.id, leadId: ma.leadId, address: ma.address })) {
    const rec = { ok: false, contactId: null, propertyId: null, detail: TEST_REFUSAL, at };
    await remember(ma.id, rec, by);
    return rec;
  }

  const userId = await agentUserId(ma.agent, opts.userId ?? null);
  const owner = await landlordInRex(ma.leadId, userId, by);
  const notes = [owner.note].filter(Boolean);

  let propertyId = ma.rexPropertyId ? String(ma.rexPropertyId) : null;
  let how = propertyId ? "already linked" : "";

  if (!propertyId) {
    const full = ma.postcode && !ma.address.includes(ma.postcode) ? `${ma.address}, ${ma.postcode}` : ma.address;
    /* The home REX already holds - a returning landlord or a re-let must not
       become a second record. Sure of it: link it. Nearly sure: leave it for
       the agent to pick on the file rather than guess or make a duplicate. */
    const found = await matchProperty(full).catch(() => null);
    /* Lettings properties only: the matcher also knows REX PM's homes, whose
       ids ("pm-...") are a different system and no use to a listing. */
    const lettings = (list: { id: string; name: string }[]) => list.filter((t) => /^\d+$/.test(t.id));
    const match = found ? { ...found, targets: lettings(found.targets) } : null;
    if (match?.verdict === "confident" && match.targets.length) {
      propertyId = match.targets[0].id;
      how = `found in REX (${match.how})`;
    } else if (match?.verdict === "check" && match.targets.length) {
      notes.unshift(`REX may already hold this home (${match.targets.map((t) => t.name).join("; ")}), so nothing was created. Pick it with Link it on the appraisal.`);
    } else {
      const parts = splitAddress(ma.address, ma.postcode || null);
      const made = await createProperty({ ...parts, ownerContactId: owner.id }, userId);
      if (made.ok) {
        propertyId = made.propertyId;
        how = owner.id && !made.ownerDropped ? "created in REX with the landlord as owner" : "created in REX";
        if (made.ownerDropped) notes.push("REX would not join the landlord as owner, so add them on the property in REX.");
      } else {
        notes.unshift(`Property not created: ${made.ownerDetail ?? made.detail}`);
      }
    }
    if (propertyId) await recordValuation(ma.id, { rexPropertyId: propertyId }, by === "automatic" ? "TLE OS" : by).catch(() => null);
  }

  const rec: InstructRecord = {
    ok: Boolean(propertyId && owner.id),
    contactId: owner.id,
    propertyId,
    detail: [propertyId ? `Property ${propertyId}, ${how}.` : "", owner.id ? `Landlord is REX contact ${owner.id}.` : "", ...notes].filter(Boolean).join(" "),
    at,
  };
  await remember(ma.id, rec, by);
  return rec;
}

/**
 * The cron's sweep: every signed file from the last 60 days that REX still
 * has no property for, retried at most once an hour.
 */
export async function runInstructionSweep(): Promise<{ tried: number; linked: number; failed: string[] }> {
  const out = { tried: 0, linked: 0, failed: [] as string[] };
  if (!hasDb()) return out;
  const rows = await q<{ appraisal_id: string }>(
    `SELECT DISTINCT d.appraisal_id
       FROM os_signed_documents d
       JOIN os_market_appraisals a ON a.id = d.appraisal_id
      WHERE d.completed_at IS NOT NULL AND d.submitter_id > 0
        AND d.completed_at > NOW() - INTERVAL '60 days'
        AND (a.rex_property_id IS NULL OR a.rex_property_id = '')
        AND NOT EXISTS (
          SELECT 1 FROM os_case_state s
           WHERE s.kind = $1 AND s.record_id = d.appraisal_id AND s.updated_at > NOW() - INTERVAL '1 hour'
        )
      LIMIT 10`,
    [KIND]
  ).catch(() => []);
  for (const { appraisal_id: id } of rows) {
    out.tried++;
    try {
      /* A signature may have come back unsigned since: only a completed one counts. */
      if (!(await signedFor(id)).some((r) => r.completed_at)) continue;
      const rec = await putInstructionInRex(id);
      if (rec.propertyId) out.linked++;
      else out.failed.push(`${id}: ${rec.detail}`);
    } catch (e) {
      out.failed.push(`${id}: ${e instanceof Error ? e.message : "failed"}`);
    }
  }
  return out;
}
