import "server-only";
import { hasDb, q } from "@/lib/db";
import { currentLets } from "@/lib/current-lets";
import { countsOf, landlordsOf } from "@/lib/managed-book";
import { getPropolyCompletes } from "@/lib/business/propoly-deals";
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

/* ---------------------------------------------------- a new let moves it on -- */

/* Rhiannon Dodge, 23 Oct 2026, on Apartment 1, 76 Fore Street: "This let is
   showing as a let only but it is managed." The record was settled on 25 Sep
   from Susan's sheet and REX PM - tenant find, rightly, for the let of Sep
   2025. The landlord took full management with the new let moving in on 1 Oct
   2026 (Propoly, and PayProp's 12% fee), and nothing ever moved the record on,
   so Portfolio and compliance kept saying let only. A completed Propoly let
   that moved in after the record was decided now decides it. Nothing goes to
   REX or Propoly; staff still change REX's own field by hand. */

const LEVEL_OF: Record<string, string> = { full_managed: "managed", tenant_find: "market_only", rent_collect: "rent_collect" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const addressKey = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const longDay = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

/** "(decided 25 Sep 2026)" in the record's basis, as 2026-09-25. Null when it says no date. */
function decidedOn(basis: string | null): string | null {
  const m = /decided (\d{1,2}) ([A-Z][a-z]{2}) (\d{4})/.exec(basis ?? "");
  const month = m ? MONTHS.indexOf(m[2]) : -1;
  return m && month >= 0 ? `${m[3]}-${String(month + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}

/**
 * Bring each record's service up to its latest completed Propoly let, where
 * that let moved in after the record was decided and says otherwise. Reads
 * the saved copy of Propoly's completed deals, never Propoly. Matched on the
 * address alone, and only where exactly one active record has it. Run by the
 * Propoly watcher (/api/pretenancy/watch). Returns the homes it moved on.
 */
export async function followNewLets(): Promise<string[]> {
  if (!hasDb()) return [];
  const completes = await getPropolyCompletes().catch(() => null);
  if (!completes?.length) return [];
  const today = new Date().toISOString().slice(0, 10);

  const latest = new Map<string, { date: string; level: string }>();
  for (const d of completes) {
    const level = LEVEL_OF[d.service ?? ""];
    if (!level || !d.date || d.date > today || !d.address) continue;
    const k = addressKey(d.address);
    const held = latest.get(k);
    if (!held || d.date > held.date) latest.set(k, { date: d.date.slice(0, 10), level });
  }

  const rows = await q<{ id: string; address: string; service_level: string | null; service_basis: string | null }>(
    `SELECT id, address, service_level, service_basis FROM os_properties WHERE active`
  );
  const byAddress = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = addressKey(r.address);
    byAddress.set(k, [...(byAddress.get(k) ?? []), r]);
  }

  const moved: string[] = [];
  for (const [k, deal] of latest) {
    const homes = byAddress.get(k);
    if (homes?.length !== 1) continue;
    const r = homes[0];
    const decided = decidedOn(r.service_basis);
    if (!decided || deal.date <= decided || r.service_level === deal.level) continue;
    const basis = `The let moving in on ${longDay(deal.date)} is ${LABEL[deal.level]} in Propoly; it was ${LABEL[r.service_level ?? ""] ?? "not set"} (decided ${longDay(deal.date)})`;
    await q(`UPDATE os_properties SET service_level = $2, service_basis = $3, updated_at = NOW() WHERE id = $1`, [r.id, deal.level, basis]);
    moved.push(`${r.address}: ${LABEL[deal.level]}`);
  }
  return moved;
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
