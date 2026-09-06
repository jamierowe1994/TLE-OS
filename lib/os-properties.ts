import "server-only";
import { hasDb, q } from "@/lib/db";

/**
 * The OS's own property record.
 *
 * James, 6 Sep 2026: the OS is to replace REX PM, so it has to carry every
 * home REX PM manages - including the ones REX CRM has no property for -
 * and match REX PM's figures exactly. This table is that record. One row
 * per REX PM property (and, later, per home booked straight into the OS):
 * its reference, address, bedrooms, management status and REX PM's
 * compliance categories, plus the facts the OS takes from them (an HMO,
 * no gas). Where the address matched a REX CRM property the row is linked
 * to it; where it did not, the home is "not on REX" and the OS is its
 * only record.
 *
 * Reads elsewhere: the managed book and the compliance book append the
 * unlinked rows so Portfolio, Compliance and the tracker count them, and
 * take `hmo` / `no_gas` for linked rows as facts about the REX property.
 */

export interface OsProperty {
  id: string;
  source: string;
  ref: string;
  address: string;
  name: string;
  locality: string;
  postcode: string | null;
  town: string | null;
  bedrooms: number | null;
  management: string | null;
  categories: string[];
  hmo: boolean;
  noGas: boolean;
  rexPropertyId: string | null;
  matchHow: string | null;
  active: boolean;
}

type Row = {
  id: string;
  source: string;
  ref: string;
  address: string;
  name: string;
  locality: string;
  postcode: string | null;
  town: string | null;
  bedrooms: number | null;
  management: string | null;
  categories: string[] | null;
  hmo: boolean;
  no_gas: boolean;
  rex_property_id: string | null;
  match_how: string | null;
  active: boolean;
};

const rowTo = (r: Row): OsProperty => ({
  id: r.id,
  source: r.source,
  ref: r.ref,
  address: r.address,
  name: r.name,
  locality: r.locality,
  postcode: r.postcode,
  town: r.town,
  bedrooms: r.bedrooms,
  management: r.management,
  categories: r.categories ?? [],
  hmo: Boolean(r.hmo),
  noGas: Boolean(r.no_gas),
  rexPropertyId: r.rex_property_id,
  matchHow: r.match_how,
  active: Boolean(r.active),
});

export const isOsPropertyId = (id: string | null | undefined): boolean => /^pm-[0-9a-f-]+$/i.test(String(id ?? ""));

export async function listOsProperties(): Promise<OsProperty[]> {
  if (!hasDb()) return [];
  const rows = await q<Row>(`SELECT * FROM os_properties ORDER BY name`).catch(() => []);
  return rows.map(rowTo);
}

/** Homes the OS holds that REX CRM does not, still under management. */
export async function notOnRex(): Promise<OsProperty[]> {
  if (!hasDb()) return [];
  const rows = await q<Row>(`SELECT * FROM os_properties WHERE (rex_property_id IS NULL OR rex_property_id = '') AND active ORDER BY name`).catch(() => []);
  return rows.map(rowTo);
}

/** What the OS knows about a REX property from its own record: HMO, no gas. */
export async function factsByRexId(): Promise<Map<string, { hmo: boolean; noGas: boolean; ref: string }>> {
  const out = new Map<string, { hmo: boolean; noGas: boolean; ref: string }>();
  if (!hasDb()) return out;
  const rows = await q<Row>(`SELECT * FROM os_properties WHERE rex_property_id IS NOT NULL AND rex_property_id <> ''`).catch(() => []);
  for (const r of rows) {
    const held = out.get(r.rex_property_id as string);
    out.set(r.rex_property_id as string, { hmo: Boolean(r.hmo) || Boolean(held?.hmo), noGas: Boolean(r.no_gas) || Boolean(held?.noGas), ref: r.ref });
  }
  return out;
}

export async function getOsProperty(id: string): Promise<OsProperty | null> {
  if (!hasDb()) return null;
  const rows = await q<Row>(`SELECT * FROM os_properties WHERE id = $1`, [id]).catch(() => []);
  return rows[0] ? rowTo(rows[0]) : null;
}
