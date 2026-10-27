import "server-only";
import { hasDb, q } from "@/lib/db";
import { uid } from "@/lib/auth";
import type { DueVisit } from "@/lib/inspections";

/**
 * A home taken off Inspections by hand (Rhiannon Dodge, 23 Oct 2026: "This
 * property isn't managed so shouldn't be coming up for inspections but don't
 * understand how to remove it?").
 *
 * The scope rule already keeps let only, rent collect and leavers' homes off
 * the Due list (app/api/inspections). This is for the home whose record says
 * otherwise and is wrong: the agent who knows takes it off, says why, and it
 * stays off until somebody puts it back. It only leaves this list - the home's
 * service, its compliance and everything else stay as they are, and nobody is
 * emailed. Who, when and why are kept, and the list sits at the foot of Due
 * for anybody to see and undo.
 *
 * Kept as one list in os_settings: a handful of homes, read with the board.
 */

export const OFF_REASONS = [
  { id: "let_only", label: "Let only" },
  { id: "rent_collect", label: "Rent collect only" },
  { id: "not_ours", label: "Not with us any more" },
  { id: "other", label: "Something else" },
] as const;
export type OffReason = (typeof OFF_REASONS)[number]["id"];
const REASON_IDS = OFF_REASONS.map((r) => r.id) as readonly string[];

export interface OffHome {
  id: string;
  /** Every id the home was due under: the OS record, REX property, listing. */
  homes: string[];
  propertyName: string;
  locality: string;
  reason: OffReason;
  note: string;
  by: string;
  at: string;
}

const KEY = "inspections-off";

/** Throws on a database error - a failed read must not put every home back on Due. */
export async function homesOff(): Promise<OffHome[]> {
  if (!hasDb()) return [];
  const rows = await q<{ value: OffHome[] | null }>(`SELECT value FROM os_settings WHERE key = $1`, [KEY]);
  return Array.isArray(rows[0]?.value) ? rows[0].value : [];
}

async function save(list: OffHome[], by: string) {
  await q(
    `INSERT INTO os_settings (key, value, updated_by) VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = NOW(), updated_by = $3`,
    [KEY, JSON.stringify(list), by]
  );
}

export async function takeOff(
  input: { homes: (string | null | undefined)[]; propertyName: string; locality?: string; reason: string; note?: string },
  by: string
): Promise<OffHome> {
  const homes = [...new Set(input.homes.map((h) => String(h ?? "").trim()).filter(Boolean))];
  if (!homes.length) throw new Error("This home has nothing to know it by, so it can't be taken off.");
  if (!REASON_IDS.includes(input.reason)) throw new Error("Say why it isn't ours to visit.");
  const note = (input.note ?? "").trim().slice(0, 300);
  if (input.reason === "other" && !note) throw new Error("Say why in the note.");
  const list = await homesOff();
  const held = list.find((o) => o.homes.some((h) => homes.includes(h)));
  if (held) return held;
  const entry: OffHome = {
    id: uid(), homes, propertyName: input.propertyName.trim().slice(0, 200), locality: (input.locality ?? "").trim().slice(0, 120),
    reason: input.reason as OffReason, note, by, at: new Date().toISOString(),
  };
  await save([entry, ...list], by);
  return entry;
}

export async function putBack(id: string, by: string): Promise<void> {
  const list = await homesOff();
  if (!list.some((o) => o.id === id)) throw new Error("That home is already back on the list.");
  await save(list.filter((o) => o.id !== id), by);
}

/** The due rows with the homes taken off by hand left out. */
export function withoutOff(due: DueVisit[], off: OffHome[]): DueVisit[] {
  if (!off.length) return due;
  const gone = new Set(off.flatMap((o) => o.homes));
  return due.filter((d) => ![d.osPropertyId, d.propertyId, d.listingId].some((h) => h && gone.has(h)));
}
