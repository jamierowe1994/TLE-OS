import "server-only";
import { hasDb, q } from "@/lib/db";
import type { CompProperty } from "@/lib/compliance";
import { NO_FACTS, isChoice, type FactKey, type HomeFacts } from "@/lib/home-facts-shared";

/**
 * What a person in the OS has said about a home (os_home_facts, 19 Oct 2026).
 * The choices and what each one changes: lib/home-facts-shared.
 *
 * Who wins. REX guesses a home is an HMO from its licence entries and that it
 * has gas from its gas entries; REX PM's categories say "HMO" or "No Gas".
 * An answer given here beats all of them, because it is the only one a person
 * gave on purpose about this home. It is kept in the OS alone and never
 * written to REX (REX is read-only without James's yes).
 *
 * The OS's own property record (os_properties.hmo / not_hmo / no_gas) is kept
 * in step where the home has one, so the clean sweep, the listing's type of
 * let and everything else reading those columns say the same thing.
 */

type Row = {
  home_key: string;
  home_type: string | null;
  gas_supply: string | null;
  hot_water: string | null;
  electrical_cert: string | null;
  eic_reason: string | null;
  set_by: Partial<Record<FactKey, { by: string; at: string }>> | null;
};

const COLUMN: Record<FactKey, keyof Row> = {
  homeType: "home_type",
  gasSupply: "gas_supply",
  hotWater: "hot_water",
  electrical: "electrical_cert",
  eicReason: "eic_reason",
};

const rowTo = (r: Row): HomeFacts => ({
  homeType: isChoice("homeType", r.home_type) ? (r.home_type as HomeFacts["homeType"]) : null,
  gasSupply: isChoice("gasSupply", r.gas_supply) ? (r.gas_supply as HomeFacts["gasSupply"]) : null,
  hotWater: isChoice("hotWater", r.hot_water) ? (r.hot_water as HomeFacts["hotWater"]) : null,
  electrical: isChoice("electrical", r.electrical_cert) ? (r.electrical_cert as HomeFacts["electrical"]) : null,
  eicReason: isChoice("eicReason", r.eic_reason) ? (r.eic_reason as HomeFacts["eicReason"]) : null,
  setBy: r.set_by ?? {},
});

export const isHomeKey = (v: unknown): v is string => typeof v === "string" && /^(\d+|pm-(test-)?[0-9a-f-]+)$/i.test(v);

export async function homeFactsFor(key: string): Promise<HomeFacts> {
  if (!hasDb() || !isHomeKey(key)) return NO_FACTS;
  const rows = await q<Row>(`SELECT * FROM os_home_facts WHERE home_key = $1`, [key]);
  return rows[0] ? rowTo(rows[0]) : NO_FACTS;
}

/** Every home anybody has answered for. Throws on a database error, so the book is not built as if nobody had. */
export async function allHomeFacts(): Promise<Map<string, HomeFacts>> {
  const out = new Map<string, HomeFacts>();
  if (!hasDb()) return out;
  for (const r of await q<Row>(`SELECT * FROM os_home_facts`)) out.set(r.home_key, rowTo(r));
  return out;
}

/** Keep one or more answers for a home. Only the facts given are touched. */
export async function setHomeFacts(key: string, change: Partial<Record<FactKey, string>>, by: string): Promise<HomeFacts> {
  if (!isHomeKey(key)) throw new Error("Which home?");
  const keys = (Object.keys(change) as FactKey[]).filter((k) => COLUMN[k] && isChoice(k, change[k]));
  if (!keys.length) return homeFactsFor(key);
  const at = new Date().toISOString();
  const stamp = Object.fromEntries(keys.map((k) => [k, { by, at }]));
  const cols = keys.map((k) => COLUMN[k] as string);
  const vals = keys.map((k) => change[k] as string);
  await q(
    `INSERT INTO os_home_facts (home_key, ${cols.join(", ")}, set_by)
     VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(", ")}, $${cols.length + 2}::jsonb)
     ON CONFLICT (home_key) DO UPDATE SET ${cols.map((c) => `${c} = EXCLUDED.${c}`).join(", ")},
       set_by = os_home_facts.set_by || EXCLUDED.set_by, updated_at = NOW()`,
    [key, ...vals, JSON.stringify(stamp)]
  );
  /* The OS property record, kept in step (see above). */
  const where = `WHERE id = $1 OR rex_property_id = $1`;
  if (change.homeType === "single") await q(`UPDATE os_properties SET not_hmo = TRUE, updated_at = NOW() ${where}`, [key]).catch(() => null);
  if (change.homeType === "hmo") await q(`UPDATE os_properties SET hmo = TRUE, not_hmo = FALSE, updated_at = NOW() ${where}`, [key]).catch(() => null);
  if (change.gasSupply === "none") await q(`UPDATE os_properties SET no_gas = TRUE, updated_at = NOW() ${where}`, [key]).catch(() => null);
  if (change.gasSupply === "gas") await q(`UPDATE os_properties SET no_gas = FALSE, updated_at = NOW() ${where}`, [key]).catch(() => null);
  return homeFactsFor(key);
}

/**
 * Put the answers onto a built compliance book, last, so they beat REX's
 * licence and gas entries and REX PM's categories. Rooms of a shared house
 * are answered one by one: a room's answer is its own.
 */
export function applyHomeFacts(properties: CompProperty[], facts: Map<string, HomeFacts>): void {
  for (const p of properties) {
    const f = facts.get(String(p.id));
    if (f) applyOne(p, f);
  }
}

export function applyOne(p: CompProperty, f: HomeFacts): void {
  if (f.homeType === "single") p.hmo = false;
  if (f.homeType === "hmo") p.hmo = true;
  if (f.gasSupply === "none") { p.hasGas = false; p.gasAnswered = true; }
  if (f.gasSupply === "gas") { p.hasGas = true; p.gasAnswered = true; }
  if (f.electrical === "eic") p.eic = { reason: f.eicReason };
  else delete p.eic;
  p.factsBy = f.setBy;
}
