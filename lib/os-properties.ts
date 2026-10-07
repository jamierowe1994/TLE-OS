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
  /** The office said it is not an HMO, whatever REX's licence entries suggest (7 Oct 2026). */
  notHmo: boolean;
  noGas: boolean;
  rexPropertyId: string | null;
  matchHow: string | null;
  active: boolean;
  /** From Susan's PayProp clean sweep (24 Sep 2026), where REX names nobody. */
  landlordName: string | null;
  agentName: string | null;
  paypropNo: string | null;
  /** The tenants in residence, from the same sheet, "A, B". */
  tenantNames: string | null;
  /**
   * 'managed' or 'market_only' (tenant-find / let only), decided by the OS
   * from whichever of REX PM and PayProp changed most recently (James, 25 Sep).
   * It outranks REX CRM's listing service type, which is often blank or stale.
   * 'rent_collect': we collect the rent and nothing else (James, 2 Oct 2026).
   */
  serviceLevel: "managed" | "market_only" | "rent_collect" | null;
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
  not_hmo?: boolean | null;
  no_gas: boolean;
  rex_property_id: string | null;
  match_how: string | null;
  active: boolean;
  landlord_name?: string | null;
  agent_name?: string | null;
  payprop_no?: string | null;
  tenant_names?: string | null;
  service_level?: string | null;
  pm_managed?: boolean | null;
  pm_status?: string | null;
  pm_upcoming_vacancy?: boolean | null;
  pm_service?: string | null;
  pm_read_at?: string | null;
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
  hmo: Boolean(r.hmo) && !r.not_hmo,
  notHmo: Boolean(r.not_hmo),
  noGas: Boolean(r.no_gas),
  rexPropertyId: r.rex_property_id,
  matchHow: r.match_how,
  active: Boolean(r.active),
  landlordName: r.landlord_name?.trim() || null,
  agentName: r.agent_name?.trim() || null,
  paypropNo: r.payprop_no ?? null,
  tenantNames: r.tenant_names?.trim() || null,
  serviceLevel: r.service_level === "managed" || r.service_level === "market_only" || r.service_level === "rent_collect" ? r.service_level : null,
});

export const isOsPropertyId = (id: string | null | undefined): boolean => /^pm-(test-)?[0-9a-f-]+$/i.test(String(id ?? ""));

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

/** A home on REX PM's own managed list, with what that list says about it. */
export interface PmHome extends OsProperty {
  pmStatus: "occupied" | "vacant" | null;
  pmUpcomingVacancy: boolean;
  pmService: string | null;
}

/**
 * The homes REX PM itself counts as managed - its Properties screen, Active
 * letting agreement tab - as last read across (2 Oct 2026). Null when it has
 * never been read, so callers fall back to the older rule rather than read an
 * empty book as "we manage nothing". Throws on a database error, for the same
 * reason as activeOsProperties.
 */
export async function pmManagedHomes(): Promise<PmHome[] | null> {
  if (!hasDb()) return null;
  const read = await q<{ n: string }>(`SELECT COUNT(*)::text AS n FROM os_properties WHERE pm_read_at IS NOT NULL`);
  if (!Number(read[0]?.n ?? 0)) return null;
  const rows = await q<Row>(`SELECT * FROM os_properties WHERE pm_managed ORDER BY name`);
  return rows.map((r) => ({
    ...rowTo(r),
    pmStatus: r.pm_status === "occupied" || r.pm_status === "vacant" ? r.pm_status : null,
    pmUpcomingVacancy: Boolean(r.pm_upcoming_vacancy),
    pmService: r.pm_service ?? null,
  }));
}

/** Every home REX PM manages today (active letting agreement), linked or not. */
export async function activeOsProperties(): Promise<OsProperty[]> {
  if (!hasDb()) return [];
  /* No .catch (1 Oct 2026). This set decides which homes are ours
     (managedByPm), so an empty answer on a database blip made Compliance read
     "0 homes we manage", Portfolio lose every home not on REX and its
     certificates-to-renew go to 0, and Inspections show nothing due - all as
     if true, and cached. A failure now fails the read, so the cache serves
     its last good copy marked old, or the screen says it couldn't load. */
  const rows = await q<Row>(`SELECT * FROM os_properties WHERE active ORDER BY name`);
  return rows.map(rowTo);
}

type OsFacts = { hmo: boolean; notHmo: boolean; noGas: boolean; ref: string; landlordName: string | null; agentName: string | null; tenantNames: string | null; serviceLevel: string | null };

/** What the OS knows about a REX property from its own record: HMO, no gas, and who owns and looks after it. */
export async function factsByRexId(): Promise<Map<string, OsFacts>> {
  const out = new Map<string, OsFacts>();
  if (!hasDb()) return out;
  const rows = await q<Row>(`SELECT * FROM os_properties WHERE rex_property_id IS NOT NULL AND rex_property_id <> ''`).catch(() => []);
  for (const r of rows) {
    const held = out.get(r.rex_property_id as string);
    out.set(r.rex_property_id as string, {
      hmo: Boolean(r.hmo) || Boolean(held?.hmo),
      notHmo: Boolean(r.not_hmo) || Boolean(held?.notHmo),
      noGas: Boolean(r.no_gas) || Boolean(held?.noGas),
      ref: r.ref,
      landlordName: held?.landlordName || r.landlord_name?.trim() || null,
      agentName: held?.agentName || r.agent_name?.trim() || null,
      tenantNames: held?.tenantNames || r.tenant_names?.trim() || null,
      serviceLevel: held?.serviceLevel || r.service_level || null,
    });
  }
  return out;
}

export async function getOsProperty(id: string): Promise<OsProperty | null> {
  if (!hasDb()) return null;
  const rows = await q<Row>(`SELECT * FROM os_properties WHERE id = $1`, [id]).catch(() => []);
  return rows[0] ? rowTo(rows[0]) : null;
}

/**
 * Homes the OS records as rent collect, by OS id and by REX property id. We
 * collect the rent on these and nothing else, so renewals are the landlord's
 * (James, 2 Oct 2026). Empty when there is no database.
 */
export async function rentCollectIds(): Promise<Set<string>> {
  const out = new Set<string>();
  if (!hasDb()) return out;
  const rows = await q<Row>(`SELECT * FROM os_properties WHERE service_level = 'rent_collect' AND active`).catch(() => []);
  for (const r of rows) {
    out.add(r.id);
    if (r.rex_property_id) out.add(r.rex_property_id);
  }
  return out;
}
