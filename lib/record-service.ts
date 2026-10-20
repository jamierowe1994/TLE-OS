import "server-only";
import { hasDb, q } from "@/lib/db";
import { currentLets } from "@/lib/current-lets";
import { countsOf, landlordsOf } from "@/lib/managed-book";
import type { ManagedBook } from "@/lib/portfolio-types";

/**
 * The service from the OS's own property record, over REX's (James
 * Crumpton, 20 Oct 2026: "I am missing 6 managed units from my portfolio but
 * they are on the system under different statuses").
 *
 * Portfolio's Service came from the REX listing's lettings_service_type, a
 * field nobody keeps up: blank on 16 Sturmer Close, 1 Smythe Croft, Church
 * View, 8 Lower Station Road and 10 Leaze Close, "Let Only" on 3 Shipley Mow.
 * The OS record (os_properties.service_level) was settled for every home on
 * 25 Sep from Susan's sheet and REX PM, and compliance already reads it - all
 * six are managed there. So the record decides, and REX's field stands only
 * where the record says nothing, or where the rooms of one house sharing a
 * REX property disagree.
 *
 * Laid over the book at read time, like the record landlords, so a level
 * changed on the record shows on the next page load. Nothing goes to REX.
 */

const LABEL: Record<string, string> = { managed: "Managed", market_only: "Let Only", rent_collect: "Rent Collect" };

type Held = { id: string; rex_property_id: string | null; service_level: string };

/** The record's service per OS home id and per REX property id; "" where rooms disagree. */
async function recordServices(): Promise<Map<string, string>> {
  const levels = new Map<string, Set<string>>();
  if (!hasDb()) return new Map();
  const rows = await q<Held>(
    `SELECT id, rex_property_id, service_level FROM os_properties
      WHERE active AND service_level IN ('managed', 'market_only', 'rent_collect')`
  );
  for (const r of rows) {
    for (const k of [r.id, r.rex_property_id]) {
      if (!k) continue;
      if (!levels.has(k)) levels.set(k, new Set());
      levels.get(k)!.add(r.service_level);
    }
  }
  const out = new Map<string, string>();
  for (const [k, s] of levels) out.set(k, s.size === 1 ? LABEL[[...s][0]] : "");
  return out;
}

export async function withRecordService(book: ManagedBook): Promise<ManagedBook> {
  let held: Map<string, string>;
  try {
    held = await recordServices();
  } catch {
    return book;
  }
  if (!held.size) return book;
  let changed = 0;
  const properties = book.properties.map((p) => {
    if (p.test) return p;
    const s = (p.propertyId && held.get(p.propertyId)) || held.get(p.listingId);
    if (!s || s === p.service) return p;
    changed++;
    return { ...p, service: s };
  });
  if (!changed) return book;
  const landlords = landlordsOf(currentLets(properties));
  /* REX PM's own counts (homes, occupied, vacant) are its own and stay. */
  const counts = { ...book.counts, ...countsOf(properties, landlords), rentsFromPayProp: book.counts.rentsFromPayProp };
  return { ...book, properties, landlords, counts };
}
