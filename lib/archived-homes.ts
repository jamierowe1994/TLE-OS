import "server-only";
import { hasDb, q } from "@/lib/db";
import { recountBook } from "@/lib/agent-moves";
import type { ManagedBook } from "@/lib/portfolio-types";
import type { ComplianceBook } from "@/lib/rex-compliance";

/**
 * Archived homes (James, 27 Oct 2026: "give the ability to archive
 * properties to Michael ... old properties that are kicking around"). Homes
 * that are not ours any more but still come through from REX or REX PM.
 *
 * Archiving is the OS's own list, never a write to REX or REX PM. The home
 * is taken off on every read - Portfolio and everything built on its book
 * (search, the phone, Steve, inspections), and the compliance book (the desk,
 * the tracker, the chases) - so it goes the moment it is archived and comes
 * back the moment it is put back. A landlord whose homes are all archived
 * drops off with them, because the book's landlords are counted again.
 *
 * A row holds every id the home is known by: its listing ids, its REX
 * property id and the OS record's pm- id, so one archive reaches the book's
 * row, the compliance book's row and the Not on REX twin alike.
 */

export interface ArchivedHome {
  id: string;
  label: string;
  keys: string[];
  listingIds: string[];
  reason: string;
  byName: string;
  at: string;
}

let held: { at: number; rows: ArchivedHome[] } | null = null;
const FRESH_MS = 30 * 1000;

export function forgetArchived(): void {
  held = null;
}

export async function archivedHomes(): Promise<ArchivedHome[]> {
  if (!hasDb()) return [];
  if (held && Date.now() - held.at < FRESH_MS) return held.rows;
  const rows = await q<{ id: string; label: string; keys: string[]; listing_ids: string[]; reason: string; by_name: string; archived_at: Date }>(
    `SELECT id, label, keys, listing_ids, reason, by_name, archived_at FROM os_archived_homes WHERE restored_at IS NULL ORDER BY archived_at DESC`,
    []
  );
  const out = rows.map((r) => ({ id: r.id, label: r.label, keys: r.keys ?? [], listingIds: r.listing_ids ?? [], reason: r.reason, byName: r.by_name, at: new Date(r.archived_at).toISOString() }));
  held = { at: Date.now(), rows: out };
  return out;
}

async function archivedKeys(): Promise<Set<string>> {
  return new Set((await archivedHomes().catch(() => [])).flatMap((r) => r.keys));
}

/** The archive this listing is in, if any - for the home's own page. */
export async function archiveOf(listingId: string): Promise<ArchivedHome | null> {
  return (await archivedHomes().catch(() => [])).find((r) => r.listingIds.includes(listingId) || r.keys.includes(listingId)) ?? null;
}

/** Every id a home answers to: what the page sent, and the OS record's twin. */
export async function keysFor(ids: string[]): Promise<string[]> {
  const keys = new Set(ids.filter(Boolean));
  if (hasDb() && keys.size) {
    const rows = await q<{ id: string; rex_property_id: string | null }>(
      `SELECT id, rex_property_id FROM os_properties WHERE id = ANY($1) OR rex_property_id = ANY($1)`,
      [[...keys]]
    ).catch(() => []);
    for (const r of rows) {
      keys.add(r.id);
      if (r.rex_property_id) keys.add(String(r.rex_property_id));
    }
  }
  return [...keys];
}

export async function archiveHome(a: { label: string; keys: string[]; listingIds: string[]; reason: string; byName: string; byEmail: string }): Promise<string> {
  const id = crypto.randomUUID();
  await q(
    `INSERT INTO os_archived_homes (id, label, keys, listing_ids, reason, by_name, by_email) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, a.label, a.keys, a.listingIds, a.reason, a.byName, a.byEmail]
  );
  forgetArchived();
  return id;
}

export async function putBack(id: string, byName: string): Promise<ArchivedHome | null> {
  const rows = await q<{ label: string }>(
    `UPDATE os_archived_homes SET restored_at = NOW(), restored_by = $2 WHERE id = $1 AND restored_at IS NULL RETURNING label`,
    [id, byName]
  );
  forgetArchived();
  return rows[0] ? ({ id, label: rows[0].label } as ArchivedHome) : null;
}

/** The book without its archived homes, its landlords and counts taken again. */
export async function withoutArchived(book: ManagedBook): Promise<ManagedBook> {
  const gone = await archivedKeys();
  if (!gone.size) return book;
  const kept = book.properties.filter((p) => !gone.has(String(p.listingId)) && !(p.propertyId && gone.has(String(p.propertyId))));
  return kept.length === book.properties.length ? book : recountBook(book, kept);
}

/** The compliance book without its archived homes. */
export async function complianceWithoutArchived(book: ComplianceBook): Promise<ComplianceBook> {
  const gone = await archivedKeys();
  if (!gone.size) return book;
  const properties = book.properties.filter((p) => !gone.has(String(p.id)));
  if (properties.length === book.properties.length) return book;
  return {
    ...book,
    properties,
    counts: { ...book.counts, properties: properties.length, withAnyRecord: properties.filter((p) => Object.keys(p.certs).length > 0).length },
  };
}
