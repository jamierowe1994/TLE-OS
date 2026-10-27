import "server-only";
import { hasDb, q } from "@/lib/db";
import { postcodeIn } from "@/lib/postcode";
import type { ManagedProperty } from "@/lib/portfolio-types";

/**
 * A HOME'S ADDRESS ON THE OS'S OWN RECORD (Kayleigh Wright, 15 Oct 2026: "How
 * do I edit the address on a property?").
 *
 * The OS holds a home's address itself in one place: os_properties, the
 * record of every managed home (lib/os-properties), which Portfolio shows for
 * the homes it built the row from - every home "Not on REX", and the managed
 * homes REX lists no let for. Everything else a screen shows as a home's
 * address is read from the listings system each time, so the OS has nothing
 * of its own to change there; this says which is which.
 *
 * Kept in the record's own shape (seen on the live table): `address` the whole
 * line, `name` everything before the town, `town`, `postcode`, and `locality`
 * "Town POSTCODE".
 */

export interface AddressParts {
  address: string;
  name: string;
  town: string;
  postcode: string;
  locality: string;
}

/** "Flat 2, 5 Canter Close, Liverpool, L9 9JE" into the record's parts, or why not. */
export function addressParts(raw: string): AddressParts | { error: string } {
  const line = raw.replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ").replace(/,+/g, ",").trim().replace(/,$/, "");
  const postcode = postcodeIn(line);
  if (!postcode) return { error: "That address has no postcode I can read. Give me the whole address with the postcode." };
  const pc = postcode.toUpperCase().replace(/\s+/g, " ").trim();
  const before = line.replace(/[,\s]*\b[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2}\b[\s,]*(?:UK|United Kingdom)?[\s,.]*$/i, "");
  const parts = before.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return { error: "I need the street and the town as well as the postcode, e.g. 5 Canter Close, Liverpool, L9 9JE." };
  const town = parts[parts.length - 1];
  const name = parts.slice(0, -1).join(", ");
  return { address: `${name}, ${town}, ${pc}`, name, town, postcode: pc, locality: `${town} ${pc}` };
}

/** The OS record behind a Portfolio row, when the row was built from one. */
export async function osRecordFor(p: ManagedProperty): Promise<{ id: string; address: string; linked: boolean; rexPropertyId: string | null } | null> {
  if (!hasDb()) return null;
  const pm = /^pm-/i.test(String(p.propertyId ?? ""));
  const linkedRow = /^pm-link-/.test(p.listingId);
  if (!pm && !linkedRow) return null;
  const rows = pm
    ? await q<{ id: string; address: string; rex_property_id: string | null }>(`SELECT id, address, rex_property_id FROM os_properties WHERE id = $1`, [p.propertyId])
    : await q<{ id: string; address: string; rex_property_id: string | null }>(
        `SELECT id, address, rex_property_id FROM os_properties WHERE rex_property_id = $1 AND active ORDER BY updated_at DESC LIMIT 1`,
        [p.propertyId]
      );
  const r = rows[0];
  return r ? { id: r.id, address: r.address, linked: Boolean(r.rex_property_id), rexPropertyId: r.rex_property_id ? String(r.rex_property_id) : null } : null;
}

/** Save it. Returns what it said before, for the log. */
export async function saveOsAddress(id: string, parts: AddressParts): Promise<{ before: string } | null> {
  if (!hasDb()) return null;
  const rows = await q<{ before: string }>(
    `UPDATE os_properties p SET address = $2, name = $3, town = $4, postcode = $5, locality = $6, updated_at = NOW()
       FROM (SELECT address AS before FROM os_properties WHERE id = $1) o
      WHERE p.id = $1 RETURNING o.before`,
    [id, parts.address, parts.name, parts.town, parts.postcode, parts.locality]
  );
  return rows[0] ?? null;
}

/* ── Homes with no OS record of their own (15 Oct 2026, James's option A) ──

   A listing-only home - or a managed home Portfolio builds from the listings
   system - has no os_properties row. Its OS address lives in
   os_home_addresses, keyed by the REX property so every screen and the
   Propoly push find the same one. */

export interface OsHomeAddress extends AddressParts {
  rexPropertyId: string;
  listingId: string | null;
  setBy: string;
  setAt: string;
}

type HomeRow = {
  rex_property_id: string; listing_id: string | null; address: string; name: string; town: string;
  postcode: string; locality: string; set_by_name: string; set_at: Date;
};

const homeShape = (r: HomeRow): OsHomeAddress => ({
  rexPropertyId: r.rex_property_id,
  listingId: r.listing_id,
  address: r.address,
  name: r.name,
  town: r.town,
  postcode: r.postcode,
  locality: r.locality,
  setBy: r.set_by_name,
  setAt: new Date(r.set_at).toISOString(),
});

export async function osHomeAddress(rexPropertyId: string | null | undefined): Promise<OsHomeAddress | null> {
  if (!hasDb() || !rexPropertyId) return null;
  const rows = await q<HomeRow>(`SELECT * FROM os_home_addresses WHERE rex_property_id = $1`, [String(rexPropertyId)]);
  return rows[0] ? homeShape(rows[0]) : null;
}

export async function saveOsHomeAddress(
  rexPropertyId: string,
  listingId: string | null,
  parts: AddressParts,
  by: { id: string; name: string }
): Promise<{ before: string | null }> {
  const before = await osHomeAddress(rexPropertyId);
  await q(
    `INSERT INTO os_home_addresses (rex_property_id, listing_id, address, name, town, postcode, locality, set_by, set_by_name, set_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
     ON CONFLICT (rex_property_id) DO UPDATE SET listing_id = COALESCE(EXCLUDED.listing_id, os_home_addresses.listing_id),
       address = EXCLUDED.address, name = EXCLUDED.name, town = EXCLUDED.town, postcode = EXCLUDED.postcode,
       locality = EXCLUDED.locality, set_by = EXCLUDED.set_by, set_by_name = EXCLUDED.set_by_name, set_at = NOW()`,
    [rexPropertyId, listingId, parts.address, parts.name, parts.town, parts.postcode, parts.locality, by.id, by.name]
  );
  return { before: before?.address ?? null };
}

/**
 * The OS's own address for a REX property, whichever record holds it: one
 * set in the OS for this home first, then the managed-home record linked to
 * it. Null when the OS holds none. Read by the Propoly push (lib/handover)
 * to fill a town or postcode the listings system has blank.
 */
export async function osAddressForRexProperty(rexPropertyId: string | null | undefined): Promise<{ town: string | null; postcode: string | null; from: string } | null> {
  if (!hasDb() || !rexPropertyId) return null;
  const set = await osHomeAddress(rexPropertyId);
  if (set) return { town: set.town || null, postcode: set.postcode || null, from: `set in the OS by ${set.setBy || "someone"}` };
  const rows = await q<{ town: string | null; postcode: string | null }>(
    `SELECT town, postcode FROM os_properties WHERE rex_property_id = $1 AND active ORDER BY updated_at DESC LIMIT 1`,
    [String(rexPropertyId)]
  );
  const r = rows[0];
  return r && (r.town || r.postcode) ? { town: r.town?.trim() || null, postcode: r.postcode?.trim() || null, from: "the OS's managed-home record" } : null;
}
