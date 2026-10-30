import "server-only";
import { hasDb, q } from "@/lib/db";
import { isScottish } from "@/lib/property-flags";
import { STANDING_KINDS, type StandingKind, type StandingKindInfo } from "@/lib/standing-document-kinds";

/**
 * ONE FILE, ON EVERY HOME IT APPLIES TO (Michael Healy, Lianna Denholm and
 * James, 29 Oct 2026).
 *
 * In Scotland the Easy Read Notes go to the tenant before the lease is signed,
 * and it is the same document for every home. Agents were dropping it onto
 * each let's Documents as Other. James: "every time that a new application is
 * created, it will automatically add it", a bit like the contracts default.
 *
 * So it is kept once (os_standing_documents, uploaded in Admin > Standing
 * documents) and SHOWN on every Scottish let rather than copied onto each.
 * Nothing has to run when a let is created, a let from before today has it
 * too, and a new version uploaded once is the version on every let at once.
 *
 * Where it is read:
 *   - the Documents tab on the application, the pre-tenancy deal and the
 *     home's page (lib/file-documents docsForHome);
 *   - the PLC pack, which pulls a home's documents in when it is opened
 *     (lib/plc-from-file), filed under Anything else;
 *   - Email docs to the tenants (lib/home-send).
 *
 * Until the office has uploaded it, every Scottish let says so plainly on its
 * Documents tab, rather than showing nothing.
 */

export interface StandingDoc {
  kind: StandingKind;
  fileName: string;
  r2Key: string;
  mime: string;
  sizeBytes: number;
  byName: string;
  at: string;
}

type Row = { kind: string; file_name: string; r2_key: string; mime: string; size_bytes: number; by_name: string; at: Date };

const shape = (r: Row): StandingDoc => ({
  kind: r.kind as StandingKind,
  fileName: r.file_name,
  r2Key: r.r2_key,
  mime: r.mime,
  sizeBytes: Number(r.size_bytes) || 0,
  byName: r.by_name,
  at: new Date(r.at).toISOString(),
});

/** Every standing document as uploaded; a kind not uploaded yet is missing from the map. */
export async function standingDocs(): Promise<Map<StandingKind, StandingDoc>> {
  if (!hasDb()) return new Map();
  const rows = await q<Row>(`SELECT kind, file_name, r2_key, mime, size_bytes, by_name, at FROM os_standing_documents`);
  return new Map(rows.map((r) => [r.kind as StandingKind, shape(r)]));
}

export async function setStandingDoc(d: { kind: StandingKind; fileName: string; r2Key: string; mime: string; sizeBytes: number; by: { id: string; name: string } }): Promise<void> {
  await q(
    `INSERT INTO os_standing_documents (kind, file_name, r2_key, mime, size_bytes, by_id, by_name, at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
     ON CONFLICT (kind) DO UPDATE SET file_name = EXCLUDED.file_name, r2_key = EXCLUDED.r2_key, mime = EXCLUDED.mime,
       size_bytes = EXCLUDED.size_bytes, by_id = EXCLUDED.by_id, by_name = EXCLUDED.by_name, at = NOW()`,
    [d.kind, d.fileName.slice(0, 200), d.r2Key, d.mime, d.sizeBytes, d.by.id, d.by.name]
  );
}

/**
 * Scottish, by the postcode in the address the screen gave; failing that, by
 * the OS's own record of the home (os_properties), since some screens pass
 * the street and town without the postcode.
 */
export async function isScottishHome(home: { address: string; propertyId?: string | null }): Promise<boolean> {
  if (isScottish(home.address)) return true;
  const id = String(home.propertyId ?? "").trim();
  if (!id || !hasDb()) return false;
  const rows = await q<{ postcode: string | null; address: string; locality: string }>(
    `SELECT postcode, address, locality FROM os_properties WHERE id = $1 OR rex_property_id = $1 LIMIT 3`,
    [id]
  ).catch(() => []);
  return rows.some((r) => isScottish(r.postcode, r.address, r.locality));
}

/** The standing documents this home should carry, each with its file or null while nobody has uploaded it. */
export async function standingForHome(home: { address: string; propertyId?: string | null }): Promise<{ info: StandingKindInfo; doc: StandingDoc | null }[]> {
  if (!hasDb()) return [];
  const scottish = await isScottishHome(home);
  const kinds = STANDING_KINDS.filter((k) => k.where === "scotland" && scottish);
  if (!kinds.length) return [];
  const held = await standingDocs().catch(() => new Map<StandingKind, StandingDoc>());
  return kinds.map((info) => ({ info, doc: held.get(info.kind) ?? null }));
}
