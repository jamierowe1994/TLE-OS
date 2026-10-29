import "server-only";
import { hasDb, q } from "@/lib/db";
import { isOurs, type CompProperty } from "@/lib/compliance";
import type { RexpmTask } from "@/lib/rexpm-tasks";

/**
 * Which of REX PM's open tasks sit on homes we don't look after, for the
 * boards that list them (Inspections, Tenancy Reviews).
 *
 * REX PM keeps a task open on a home whatever its service: Michael Healy
 * closed 76 Chiltern Road and 6 Linford Close off Tenancy Reviews by hand on
 * 29 Oct 2026 ("it was a tenant find"), two of 24 tenant-find reviews the
 * board had listed. Inspections had this scope since 27 Oct; Tenancy Reviews
 * only ever dropped rent collect.
 *
 * One rule for both, the compliance screen's own (lib/compliance isOurs):
 * a task on a home the compliance book knows and doesn't count as ours is
 * dropped - let only, rent collect, not let, or an agent who has left. A home
 * the book doesn't know falls back to its record here: let only or rent
 * collect is dropped, anything else stays, as nothing says otherwise.
 *
 * `book` null (the compliance book couldn't be read) leaves the record alone
 * deciding, so REX being down never puts a let-only home back on a board.
 */
export async function notOursTask(book: CompProperty[] | null): Promise<(t: RexpmTask) => boolean> {
  const known = new Set((book ?? []).map((p) => String(p.id)));
  const ours = new Set((book ?? []).filter(isOurs).map((p) => String(p.id)));
  const offRecord = await notManagedRecords();
  return (t) => {
    const homes = [t.osPropertyId, t.rexPropertyId].filter((x): x is string => Boolean(x));
    if (homes.some((h) => known.has(h))) return !homes.some((h) => ours.has(h));
    return homes.some((h) => offRecord.has(h));
  };
}

/** Homes the OS records as let only or rent collect, by OS id and REX property id. */
async function notManagedRecords(): Promise<Set<string>> {
  const out = new Set<string>();
  if (!hasDb()) return out;
  const rows = await q<{ id: string; rex_property_id: string | null }>(
    `SELECT id, rex_property_id FROM os_properties WHERE active AND service_level IN ('market_only', 'rent_collect')`
  );
  for (const r of rows) {
    out.add(r.id);
    if (r.rex_property_id) out.add(r.rex_property_id);
  }
  return out;
}
