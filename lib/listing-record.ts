import "server-only";
import { hasDb, q } from "@/lib/db";
import { isScottish } from "@/lib/property-flags";

/**
 * WHAT THE OS ALREADY KNOWS ABOUT A LISTING'S HOME (6 Oct 2026).
 *
 * 6 Ruskin Place was relisted in REX on a property our sync had created with
 * no landlord on it. REX CRM said "no landlord" and showed no EPC band, while
 * the OS's own property record held all of it: Paul & Vicky Wilson from REX
 * PM, the landlord registration number with its evidence, and EPC D (68) from
 * the Scottish register. The listing file only ever looked in REX CRM.
 *
 * This is the join: REX property id -> os_properties -> os_property_facts.
 * Facts written from a listing with no OS property are kept under the REX
 * property id itself, so they are still found next time.
 */

export type EpcBand = "A" | "B" | "C" | "D" | "E" | "F" | "G";

export interface ListingRecord {
  /** os_properties.id, or null where the OS holds no record for this home. */
  osPropertyId: string | null;
  /** Where facts for this home are kept: the OS id, else the REX property id. */
  factsKey: string | null;
  landlordName: string | null;
  landlordRegistration: string | null;
  /** From the property record, e.g. "D (68)" off the Scottish register. */
  epc: { band: EpcBand | null; score: number | null; from: string } | null;
  scotland: boolean;
}

/** SAP score to band, the scale every EPC prints. */
export function bandForScore(score: number | null | undefined): EpcBand | null {
  if (score == null || !Number.isFinite(score) || score < 1) return null;
  if (score >= 92) return "A";
  if (score >= 81) return "B";
  if (score >= 69) return "C";
  if (score >= 55) return "D";
  if (score >= 39) return "E";
  if (score >= 21) return "F";
  return "G";
}

function parseEpc(value: string | null): { band: EpcBand | null; score: number | null } | null {
  if (!value) return null;
  const band = (value.match(/\b([A-G])\b/i)?.[1]?.toUpperCase() ?? null) as EpcBand | null;
  const n = Number(value.match(/\((\d{1,3})\)/)?.[1] ?? value.match(/\b(\d{1,3})\b/)?.[1] ?? NaN);
  const score = Number.isFinite(n) && n > 0 && n <= 120 ? n : null;
  if (!band && score == null) return null;
  return { band: band ?? bandForScore(score), score };
}

const held = new Map<string, { at: number; record: ListingRecord }>();
const TTL_MS = 2 * 60 * 1000;

export function forgetRecord(rexPropertyId: string | null | undefined): void {
  if (rexPropertyId) held.delete(rexPropertyId);
}

export async function recordForProperty(rexPropertyId: string | null, place: { postcode?: string | null; town?: string | null; address?: string | null }): Promise<ListingRecord> {
  const scotland = isScottish(place.postcode, place.address, place.town);
  const empty: ListingRecord = { osPropertyId: null, factsKey: rexPropertyId, landlordName: null, landlordRegistration: null, epc: null, scotland };
  if (!rexPropertyId || !hasDb()) return empty;
  const hit = held.get(rexPropertyId);
  if (hit && Date.now() - hit.at < TTL_MS) return { ...hit.record, scotland };

  try {
    const homes = await q<{ id: string; landlord_name: string | null }>(
      `SELECT id, landlord_name FROM os_properties WHERE rex_property_id = $1 ORDER BY active DESC, updated_at DESC LIMIT 1`,
      [rexPropertyId]
    );
    const osId = homes[0]?.id ?? null;
    const keys = [osId, rexPropertyId].filter(Boolean) as string[];
    const facts = await q<{ property_id: string; field: string; value: string | null; source: string | null }>(
      `SELECT property_id, field, value, source FROM os_property_facts
        WHERE property_id = ANY($1::text[]) AND field IN ('landlord_registration', 'epc_rating')`,
      [keys]
    );
    /* The OS record's own fact first, then one kept under the REX id. */
    const pick = (field: string) =>
      facts.find((f) => f.field === field && f.property_id === osId && f.value) ?? facts.find((f) => f.field === field && f.value) ?? null;
    const larn = pick("landlord_registration");
    const epcRow = pick("epc_rating");
    const epc = parseEpc(epcRow?.value ?? null);
    const record: ListingRecord = {
      osPropertyId: osId,
      factsKey: osId ?? rexPropertyId,
      landlordName: homes[0]?.landlord_name?.trim() || null,
      /* "Registered (Valid)" is REX PM saying there is one, not the number. */
      landlordRegistration: larn?.value && /\d/.test(larn.value) ? larn.value.trim() : null,
      epc: epc ? { ...epc, from: epcRow?.source ?? "the property record" } : null,
      scotland,
    };
    held.set(rexPropertyId, { at: Date.now(), record });
    return record;
  } catch {
    /* A record that will not read is a blank, never a wrong answer. */
    return empty;
  }
}

/* ── The record's papers, for the listing's Documents tab ─────────────── */

/**
 * Which of the home's filed papers an agent may open from their listing.
 * The record also holds landlord ID, passports, AML and the last tenant's
 * referencing; those stay with the office (lib/r2-access refuses every
 * property- key to an agent), so they are never even listed to one.
 */
export const AGENT_RECORD_PAPERS = new Set([
  "doc_terms_of_business",
  "doc_landlord_registration",
  "doc_licence",
  "doc_rra_sheet",
  "doc_prt_notes",
]);

export interface RecordFile {
  field: string;
  key: string;
  name: string;
}

export async function recordFiles(osPropertyId: string): Promise<RecordFile[]> {
  const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");
  const { R2_BUCKET, r2Configured, withR2 } = await import("@/lib/r2");
  if (!r2Configured || !/^[\w-]+$/.test(osPropertyId)) return [];
  const prefix = `documents/property-${osPropertyId}/`;
  const out: RecordFile[] = [];
  let token: string | undefined;
  do {
    const res = await withR2((c) => c.send(new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: prefix, ContinuationToken: token })));
    for (const o of res.Contents ?? []) {
      if (!o.Key) continue;
      const field = o.Key.slice(prefix.length).split("/")[0];
      const name = o.Key.slice(o.Key.lastIndexOf("/") + 1).replace(/^(rexpm|propoly|manual)-(\d+-)?/, "").replace(/^\d+-/, "");
      if (field && name) out.push({ field, key: o.Key, name });
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return out;
}

/* ── The agent's Letting Agent Registration Number (Scotland) ─────────── */

/** "larn 1902034" / "1902034" -> "LARN1902034". Null when it is not one. */
export function normaliseLarn(v: string | null | undefined): string | null {
  const digits = (v ?? "").toUpperCase().replace(/\s+/g, "").replace(/^LARN/, "");
  return /^\d{5,9}$/.test(digits) ? `LARN${digits}` : null;
}

export async function larnForAgent(rexUserId: string | null): Promise<string | null> {
  if (!rexUserId || !hasDb()) return null;
  const rows = await q<{ larn: string }>("SELECT larn FROM os_agent_larn WHERE rex_user_id = $1", [rexUserId]).catch(() => []);
  return rows[0]?.larn ?? null;
}

export async function saveAgentLarn(rexUserId: string, larn: string, by: string): Promise<void> {
  if (!hasDb()) return;
  await q(
    `INSERT INTO os_agent_larn (rex_user_id, larn, updated_at, updated_by) VALUES ($1, $2, NOW(), $3)
     ON CONFLICT (rex_user_id) DO UPDATE SET larn = EXCLUDED.larn, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
    [rexUserId, larn, by]
  );
}

/**
 * The advert's Scottish footer: the landlord's registration number and the
 * letting agent's, as the description's last lines. Any earlier copy of
 * either line is taken out first, so a changed number replaces the old one.
 */
export function withScottishFooter(body: string, numbers: { landlord?: string | null; agent?: string | null }): string {
  const kept = body
    .split("\n")
    .filter((line) => !/^\s*(Landlord registration number|Letting agent registration number):/i.test(line))
    .join("\n")
    .trimEnd();
  const lines = [
    numbers.landlord ? `Landlord registration number: ${numbers.landlord}` : null,
    numbers.agent ? `Letting agent registration number: ${numbers.agent}` : null,
  ].filter(Boolean);
  return lines.length ? `${kept}${kept ? "\n\n" : ""}${lines.join("\n")}` : kept;
}
