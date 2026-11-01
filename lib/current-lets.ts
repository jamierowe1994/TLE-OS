/**
 * One row per home: its latest let (1 Oct 2026).
 *
 * The managed book is every LEASED listing in REX, and REX keeps a leased
 * listing for every let - so a home re-let twice is three rows. On 30 Sep the
 * book read 778 "properties" for 706 homes: 47 homes re-let, 72 extra rows,
 * £78,787 of old rents in the rent roll, and 51 old lets still carrying their
 * old tenants into "with a tenant". The list keeps every let (each home says
 * "N lets on record"); anything COUNTED or ADDED UP goes through this first.
 *
 * Latest = most recent letSince, then the higher listing id (REX ids rise).
 * A row with no property id stands alone on its listing id.
 */
type Let = { listingId: string; propertyId: string | null; letSince: string | null };

export function currentLets<T extends Let>(rows: T[]): T[] {
  const best = new Map<string, T>();
  for (const r of rows) {
    const key = r.propertyId ? `p:${r.propertyId}` : `l:${r.listingId}`;
    const held = best.get(key);
    if (!held) { best.set(key, r); continue; }
    const a = r.letSince ?? "";
    const b = held.letSince ?? "";
    if (a > b || (a === b && Number(r.listingId) > Number(held.listingId))) best.set(key, r);
  }
  /* In the order they came, so a list built from this keeps its sort. */
  const keep = new Set(best.values());
  return rows.filter((r) => keep.has(r));
}

/** The services we manage or collect rent on, as REX names them. */
export const MANAGED_SERVICES = new Set(["Managed", "Fully Managed", "Rent Collect"]);

/**
 * The homes we MANAGE, and their rent (James Crumpton, 1 Nov 2026: the
 * dashboard's Portfolio tile counted his let only homes). Each home once, on
 * its latest let, by its service - the home's own record over REX's field
 * (lib/record-service lays that on before the book is served). Let Only is
 * the landlord's to look after, and so is Rent Collect: we collect the rent
 * and nothing else (James, 2 Oct 2026), so neither is a managed home here.
 * Test homes riding alongside the book are not counted.
 */
export const MANAGED_HOME_SERVICES = new Set(["Managed", "Fully Managed"]);

export function managedHomesOf<T extends Let & { service: string | null; rentMonthly?: number | null; test?: boolean }>(rows: T[]): { homes: number; rentRoll: number } {
  const homes = currentLets(rows.filter((r) => !r.test)).filter((r) => MANAGED_HOME_SERVICES.has(r.service ?? ""));
  return { homes: homes.length, rentRoll: homes.reduce((a, r) => a + (r.rentMonthly ?? 0), 0) };
}
