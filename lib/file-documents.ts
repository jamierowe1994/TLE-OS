import "server-only";
import { uid } from "@/lib/auth";
import { hasDb, q } from "@/lib/db";
import { parseAddress, postcodeOf, sameHome } from "@/lib/address-parse";
import { docTypeLabel } from "@/lib/doc-types";

/**
 * A HOME'S DOCUMENTS, FROM ANY FILE (James, 5 Oct 2026).
 *
 * "We have no ability to upload documentation on Kirsty's board... She should
 * be able to upload the documents for them, and then that should land on the
 * agent side as well." And the same on every section: a listing, an
 * application, an appraisal, a viewing.
 *
 * So a document belongs to the HOME, not to the screen it was added from.
 * Kirstie's deal is a Propoly uuid and the agent's listing is a REX id; no id
 * joins them, so the address does - the same parser the application journey
 * uses to find a deal (lib/address-parse sameHome: street, the numbers on the
 * door, and the postcode when both carry one). The REX property id joins them
 * too when both sides know it, and two different REX properties at one address
 * (rooms in a house) stay apart.
 *
 * Uploading sends nothing to anybody: no landlord, no tenant, no REX. The
 * agent tells the customer (James: "that's down to the agent to communicate").
 */

export type FromKind = "deal" | "listing" | "application" | "appraisal" | "viewing";

export const FROM_LABEL: Record<FromKind, string> = {
  deal: "Pre-tenancy",
  listing: "Listing",
  application: "Application",
  appraisal: "Market appraisal",
  viewing: "Viewing",
};

export const isFromKind = (k: string): k is FromKind => k in FROM_LABEL;

export interface FileDoc {
  id: string;
  type: string;
  typeLabel: string;
  /** The type's name, or the uploader's own name for an Other. */
  name: string;
  fileName: string;
  mime: string;
  sizeBytes: number;
  byName: string;
  at: string;
  from: { kind: FromKind; id: string; label: string };
  url: string;
  /** The uploader, or the office: they may take it off again. */
  canRemove: boolean;
}

type Row = {
  id: string; address: string; rex_property_id: string | null; from_kind: string; from_id: string;
  type: string; name: string; file_name: string; r2_key: string; mime: string; size_bytes: number;
  by_id: string | null; by_name: string; at: Date;
};

export interface Home {
  address: string;
  propertyId?: string | null;
}

const clean = (s: string | null | undefined) => String(s ?? "").trim();

function shape(r: Row, me: { id: string; office: boolean }): FileDoc {
  const kind = (isFromKind(r.from_kind) ? r.from_kind : "listing") as FromKind;
  return {
    id: r.id,
    type: r.type,
    typeLabel: docTypeLabel(r.type),
    name: r.name,
    fileName: r.file_name,
    mime: r.mime,
    sizeBytes: Number(r.size_bytes) || 0,
    byName: r.by_name,
    at: new Date(r.at).toISOString(),
    from: { kind, id: r.from_id, label: FROM_LABEL[kind] },
    url: `/api/r2/file?key=${encodeURIComponent(r.r2_key)}`,
    canRemove: me.office || (!!r.by_id && r.by_id === me.id),
  };
}

/** One row is this home's when the REX property agrees, or failing that, the address does. */
function isThisHome(r: Row, home: Home): boolean {
  const mine = clean(home.propertyId);
  if (mine && r.rex_property_id) return r.rex_property_id === mine;
  return sameHome(r.address, home.address);
}

export async function docsForHome(home: Home, me: { id: string; office: boolean }): Promise<FileDoc[]> {
  if (!hasDb()) return [];
  const address = clean(home.address);
  const propertyId = clean(home.propertyId);
  const street = address ? parseAddress(address).street : "";
  if (!street && !propertyId) return [];
  const rows = await q<Row>(
    `SELECT id, address, rex_property_id, from_kind, from_id, type, name, file_name, r2_key, mime, size_bytes, by_id, by_name, at
       FROM os_file_documents
      WHERE removed_at IS NULL
        AND (($1 <> '' AND rex_property_id = $1) OR ($2 <> '' AND street = $2))
      ORDER BY at DESC
      LIMIT 400`,
    [propertyId, street]
  );
  return rows.filter((r) => isThisHome(r, { address, propertyId })).map((r) => shape(r, me));
}

export async function addFileDoc(p: {
  home: Home;
  from: { kind: FromKind; id: string };
  type: string;
  name: string;
  fileName: string;
  r2Key: string;
  mime: string;
  sizeBytes: number;
  by: { id: string; name: string };
  isTest: boolean;
}): Promise<void> {
  const address = clean(p.home.address);
  await q(
    `INSERT INTO os_file_documents
       (id, address, street, postcode, rex_property_id, from_kind, from_id, type, name, file_name, r2_key, mime, size_bytes, by_id, by_name, is_test)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [
      uid(), address.slice(0, 300), parseAddress(address).street, postcodeOf(address), clean(p.home.propertyId) || null,
      p.from.kind, p.from.id.slice(0, 120), p.type, p.name.slice(0, 200), p.fileName.slice(0, 200), p.r2Key,
      p.mime, p.sizeBytes, p.by.id, p.by.name, p.isTest,
    ]
  );
}

/** Taken off the file, by its uploader or the office. Kept underneath, never deleted outright. */
export async function removeFileDoc(id: string, me: { id: string; name: string; office: boolean }): Promise<boolean> {
  const rows = await q<{ id: string }>(
    `UPDATE os_file_documents SET removed_at = NOW(), removed_by = $2
      WHERE id = $1 AND removed_at IS NULL AND ($3 OR by_id = $4)
      RETURNING id`,
    [id, me.name, me.office, me.id]
  );
  return rows.length > 0;
}

/** One of a home's documents with its stored key, for a PLC pack to pull in (lib/plc-from-file). */
export interface StoredFileDoc {
  id: string;
  type: string;
  name: string;
  fileName: string;
  r2Key: string;
  mime: string;
  at: string;
  fromKind: string;
}

export async function storedDocsForHome(home: Home): Promise<StoredFileDoc[]> {
  if (!hasDb()) return [];
  const address = clean(home.address);
  const propertyId = clean(home.propertyId);
  const street = address ? parseAddress(address).street : "";
  if (!street && !propertyId) return [];
  const rows = await q<Row>(
    `SELECT id, address, rex_property_id, from_kind, from_id, type, name, file_name, r2_key, mime, size_bytes, by_id, by_name, at
       FROM os_file_documents
      WHERE removed_at IS NULL
        AND (($1 <> '' AND rex_property_id = $1) OR ($2 <> '' AND street = $2))
      ORDER BY at DESC
      LIMIT 400`,
    [propertyId, street]
  );
  return rows
    .filter((r) => isThisHome(r, { address, propertyId }))
    .map((r) => ({
      id: r.id,
      type: r.type,
      name: r.name,
      fileName: r.file_name,
      r2Key: r.r2_key,
      mime: r.mime,
      at: new Date(r.at).toISOString(),
      fromKind: r.from_kind,
    }));
}
