import type { BusinessDeal } from "@/lib/business/propoly-deals";
import { propertyKey } from "@/lib/business/payprop-portfolio";

/**
 * Duplicate deals (James, 2 Oct 2026).
 *
 * 6 Lynedoch Place Lane: Thomas Harris has two open deals in Propoly, started
 * 9 Sep and 21 Sep - same email, same flat, same move-in, same rent. The
 * first stalled and the deal was started again; nobody cancelled the first.
 * On the board that is the same tenant twice, and every check, alert and
 * update would run on both.
 *
 * THE RULE: two open deals are the same let when they are on the same
 * property AND share a tenant (by email). Rooms in one house are separate
 * lets with separate tenants, so they never match. The NEWER deal is the
 * real one; the older is shown once, as "probably left behind", with a link
 * to cancel it in Propoly - the OS never cancels anything there itself.
 */

const OPEN = new Set(["start_deal", "holding_fee", "references", "tenancy_generation", "signing_and_move_in_monies"]);
const ORDER: Record<string, number> = { start_deal: 0, holding_fee: 1, references: 2, tenancy_generation: 3, signing_and_move_in_monies: 4 };

export interface DuplicateDeal {
  /** The deal that looks left behind. */
  id: string;
  /** The deal that is going ahead. */
  keptId: string;
  property: string;
  tenant: string;
  startedOn: string | null;
  keptStartedOn: string | null;
  agent: string | null;
}

function propertyOf(d: BusinessDeal): string {
  const uuid = d.app.propoly?.propertyUuid;
  if (uuid) return `uuid:${uuid}`;
  const pc = (d.app.locality ?? "").toUpperCase().match(/[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/)?.[0]?.replace(/\s+/g, "") ?? "";
  const key = propertyKey(d.app.propertyName);
  return key ? `key:${key}|${pc}` : "";
}

const emails = (d: BusinessDeal) =>
  new Set((d.app.tenants ?? []).map((t) => (t.email ?? "").trim().toLowerCase()).filter(Boolean));

/** Newer first: started later, then further along. */
function newer(a: BusinessDeal, b: BusinessDeal): number {
  const da = a.app.dateReceived ?? "";
  const db = b.app.dateReceived ?? "";
  if (da !== db) return db.localeCompare(da);
  return (ORDER[b.statusKey] ?? 0) - (ORDER[a.statusKey] ?? 0);
}

export function findDuplicates(deals: BusinessDeal[]): Map<string, DuplicateDeal> {
  const out = new Map<string, DuplicateDeal>();
  const groups = new Map<string, BusinessDeal[]>();
  for (const d of deals) {
    if (!OPEN.has(d.statusKey)) continue;
    const p = propertyOf(d);
    if (!p) continue;
    groups.set(p, [...(groups.get(p) ?? []), d]);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort(newer);
    for (let i = 0; i < sorted.length; i++) {
      const keep = sorted[i];
      if (out.has(keep.app.id)) continue;
      const mine = emails(keep);
      if (!mine.size) continue;
      for (const older of sorted.slice(i + 1)) {
        if (out.has(older.app.id)) continue;
        if (![...emails(older)].some((e) => mine.has(e))) continue;
        const lead = (older.app.tenants ?? []).find((t) => mine.has((t.email ?? "").trim().toLowerCase()));
        out.set(older.app.id, {
          id: older.app.id,
          keptId: keep.app.id,
          property: older.app.propertyName,
          tenant: (lead?.name ?? "The tenant").replace(/\s+/g, " ").trim(),
          startedOn: older.app.dateReceived ?? null,
          keptStartedOn: keep.app.dateReceived ?? null,
          agent: older.managerName ?? null,
        });
      }
    }
  }
  return out;
}

/** The deals with the left-behind duplicates taken out. */
export function withoutDuplicates(deals: BusinessDeal[]): { deals: BusinessDeal[]; duplicates: DuplicateDeal[] } {
  const dupes = findDuplicates(deals);
  return { deals: deals.filter((d) => !dupes.has(d.app.id)), duplicates: [...dupes.values()] };
}
