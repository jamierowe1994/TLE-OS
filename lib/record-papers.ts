import "server-only";
import { hasDb, q } from "@/lib/db";
import { addrOf, isRoomAddress, sameHome } from "@/lib/address-parse";
import type { OsUser } from "@/lib/users";

/**
 * WHICH OF A HOME'S FILED PAPERS AN AGENT MAY SEE (Lianna Denholm, ticket
 * 35aa0745, 10 Nov 2026: "I cant see any of the leases on TLE").
 *
 * The clean sweep filed each managed home's papers on the OS property record
 * (R2 documents/property-<os id>/<kind>/...). The record holds the lease, but
 * also landlord ID, AML, references and right to rent, so until now the whole
 * record was the office's: the home's Documents tab listed nothing to an
 * agent and lib/r2-access refused every property- key. 480 of 620 active
 * homes held a tenancy agreement nobody running the home could open.
 *
 * James, 20 Nov 2026: an agent sees the tenancy papers on homes in their OWN
 * book. This is the one list of kinds. The home's Documents tab lists only
 * these to an agent (lib/home-send recordFiles) and /api/r2/file opens only
 * these (lib/r2-access), so the box and the opener can never disagree. Every
 * open goes through /api/r2/file and lands in os_read_log like any other.
 *
 * Everything else on the record stays with the office: landlord ID and proof
 * of ownership, AML, proof of address, tenant referencing, right to rent,
 * guarantors, NRL1, and the certificate files the compliance desk holds.
 */

/**
 * What an agent already opened from their own LISTING (lib/listing-record,
 * 6 Oct 2026). Kept as it was: the listing's gate is the listing, not the book.
 */
export const AGENT_LISTING_PAPERS: ReadonlySet<string> = new Set([
  "doc_terms_of_business",
  "doc_landlord_registration",
  "doc_licence",
  "doc_rra_sheet",
  /* On a Scottish let the signed model PRT is filed here (it carries the Easy Read Notes). */
  "doc_prt_notes",
]);

/**
 * What an agent may see and open on a home in their own book: the listing's
 * papers above, and the tenancy's own (20 Nov 2026).
 */
export const AGENT_HOME_PAPERS: ReadonlySet<string> = new Set([
  ...AGENT_LISTING_PAPERS,
  "doc_tenancy_agreement",
  "doc_deposit_cert",
  "doc_inventory",
]);

/** The kind folder a record key is filed in (documents/property-<id>/<kind>/<file>), or null. */
export function paperKind(key: string): string | null {
  const parts = key.split("/");
  if (parts.length !== 4 || parts[0] !== "documents" || !/^property-/i.test(parts[1] ?? "")) return null;
  if (!parts[2] || !parts[3] || parts.some((s) => s === "." || s === "..")) return null;
  return parts[2];
}

export type RecordRow = { id: string; address: string; rex_property_id: string | null };
type BookHome = { name: string; locality: string; propertyId?: string | null };

/** The book homes a record is found by: its own id, or its REX property (lib/home-send osRecords' query). */
export const recordLinked = (r: RecordRow, homes: BookHome[]) =>
  homes.some((p) => p.propertyId != null && (r.id === String(p.propertyId) || r.rex_property_id === String(p.propertyId)));

/**
 * Is this OS property record behind this home? The rule lib/home-send
 * osRecords has always used once a record is found: the record is the
 * home's own, or it is at the home's door, or (neither a room) it shares the
 * home's REX property. A shared house's rooms are one REX id, so a room's
 * record counts only at its own address.
 */
export function recordIsHome(r: RecordRow, p: BookHome): boolean {
  return p.propertyId === r.id || sameHome(r.address, addrOf(p)) || (!isRoomAddress(r.address) && !isRoomAddress(addrOf(p)) && r.rex_property_id === p.propertyId);
}

/**
 * Whether this OS property record is a home in this agent's own book: the
 * managed book Portfolio shows them (lib/managed-book-cache managedBookFor
 * with their REX id, agent moves and all). Not linked to REX, no book, or a
 * read that fails: false, so the door stays shut.
 */
export async function recordInAgentBook(actor: OsUser, osPropertyId: string): Promise<boolean> {
  if (!hasDb() || !osPropertyId) return false;
  try {
    const { ensureRexLink } = await import("@/lib/users");
    const rexUserId = await ensureRexLink(actor);
    if (!rexUserId) return false;
    const rows = await q<RecordRow>(`SELECT id, address, rex_property_id FROM os_properties WHERE id = $1 AND active`, [osPropertyId]);
    const rec = rows[0];
    if (!rec) return false;
    const { managedBookFor } = await import("@/lib/managed-book-cache");
    const { book } = await managedBookFor(rexUserId);
    /* Exactly how the home's page finds its records (osRecords), over the whole of their book. */
    return recordLinked(rec, book.properties) && book.properties.some((p) => recordIsHome(rec, p));
  } catch {
    return false;
  }
}
