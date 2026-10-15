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
export async function osRecordFor(p: ManagedProperty): Promise<{ id: string; address: string; linked: boolean } | null> {
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
  return r ? { id: r.id, address: r.address, linked: Boolean(r.rex_property_id) } : null;
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
