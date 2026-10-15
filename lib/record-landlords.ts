import "server-only";
import { hasDb, q } from "@/lib/db";
import { currentLets } from "@/lib/current-lets";
import { countsOf, landlordsOf } from "@/lib/managed-book";
import type { ManagedBook, Party } from "@/lib/portfolio-types";

/**
 * The landlord from the OS's own property record, where REX names nobody
 * (Lorna Fieldson, 14 Oct 2026: "still not showing landlord" on 44 Pilots Way).
 *
 * Portfolio took its landlord from one place only: the REX listing's owner.
 * On 15 Oct 342 of 600 lets had none, and for 314 of them the OS record
 * already held the landlord's name (Susan's PayProp clean sweep, 24 Sep), so
 * the home's page said "No landlord on record" over a name the OS had. The
 * landlord's page now reads the record behind REX, and where neither names
 * anybody the agent can add the landlord on the home's page; that is kept on
 * the record (os_properties.landlord_*) and is NOT written to REX.
 *
 * A record landlord has no REX contact behind it, so its contactId is
 * "record:<name>" - never numeric, which keeps ContactBlock read-only and
 * every REX write path away from it - and two homes of the same landlord
 * group together on the Landlords list.
 *
 * Laid over the book at read time, like notice (lib/portfolio-notice), so a
 * landlord added a moment ago shows without waiting for the next REX read.
 */

const key = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");
export const isRecordLandlord = (contactId: string | null | undefined) => String(contactId ?? "").startsWith("record:");

type Held = { id: string; rex_property_id: string | null; landlord_name: string | null; landlord_email: string | null; landlord_phone: string | null };

/** Every landlord the record holds, by OS home id and by REX property id. */
async function recordLandlords(): Promise<Map<string, Party>> {
  const out = new Map<string, Party>();
  if (!hasDb()) return out;
  const rows = await q<Held>(
    `SELECT id, rex_property_id, landlord_name, landlord_email, landlord_phone FROM os_properties
      WHERE landlord_name IS NOT NULL AND btrim(landlord_name) <> ''`
  );
  for (const r of rows) {
    const name = (r.landlord_name ?? "").trim();
    const party: Party = { contactId: `record:${key(name)}`, name, email: r.landlord_email?.trim() || null, phone: r.landlord_phone?.trim() || null };
    out.set(r.id, party);
    /* Rooms of one house share a REX property: the first with a name stands
       for the property, and one typed on the home's page wins over the sweep's. */
    if (r.rex_property_id && (!out.has(r.rex_property_id) || party.email || party.phone)) out.set(r.rex_property_id, party);
  }
  return out;
}

export async function withRecordLandlords(book: ManagedBook): Promise<ManagedBook> {
  let held: Map<string, Party>;
  try {
    held = await recordLandlords();
  } catch {
    return book;
  }
  if (!held.size) return book;
  /* The current let only, as the REX PM tenants are: an older let of the
     home may have been somebody else's. */
  const current = new Set(currentLets(book.properties).map((p) => p.listingId));
  let filled = 0;
  const properties = book.properties.map((p) => {
    if (p.landlord || !current.has(p.listingId)) return p;
    const l = (p.propertyId && held.get(p.propertyId)) || held.get(p.listingId);
    if (!l) return p;
    filled++;
    return { ...p, landlord: l };
  });
  if (!filled) return book;
  const landlords = landlordsOf(currentLets(properties));
  /* REX PM's own counts (homes, occupied, vacant) are its own and stay. */
  const counts = { ...book.counts, ...countsOf(properties, landlords), rentsFromPayProp: book.counts.rentsFromPayProp };
  return { ...book, properties, landlords, counts };
}

/** The OS record rows that stand for a home in the book: its own id, or every row tied to its REX property. */
export async function recordRowsFor(propertyId: string): Promise<{ id: string; landlord_name: string | null }[]> {
  if (!hasDb() || !propertyId) return [];
  return q<{ id: string; landlord_name: string | null }>(
    `SELECT id, landlord_name FROM os_properties WHERE active AND (id = $1 OR rex_property_id = $1)`,
    [propertyId]
  );
}

export async function saveRecordLandlord(ids: string[], l: { name: string; email: string | null; phone: string | null }): Promise<void> {
  await q(
    `UPDATE os_properties SET landlord_name = $2, landlord_email = $3, landlord_phone = $4, updated_at = NOW() WHERE id = ANY($1)`,
    [ids, l.name, l.email, l.phone]
  );
}
