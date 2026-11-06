import "server-only";
import { randomUUID } from "node:crypto";
import { hasDb, q } from "@/lib/db";
import { recountBook } from "@/lib/agent-moves";
import type { ManagedBook, ManagedProperty } from "@/lib/portfolio-types";
import type { ComplianceBook } from "@/lib/rex-compliance";
import {
  FIELD_SCOPE,
  SERVICE_LABEL,
  isServiceLevel,
  osTenantId,
  sayDay,
  sayValue,
  type LoggedField,
  type OverrideField,
  type OverrideLogEntry,
  type OverrideTenant,
} from "@/lib/home-overrides-shared";

/**
 * A home's details put right in the OS (2 Nov 2026). What each field is and
 * why: lib/home-overrides-shared.
 *
 * Laid over every read, never baked into a cached book, so a change shows on
 * the next load everywhere and clearing it gives REX's value straight back:
 *
 *   the managed book   lib/managed-book-cache managedBookFor - Portfolio, its
 *                      counts and tiles, the home's page, search, the phone,
 *                      inspections (their due dates count from letSince)
 *   the compliance     lib/compliance-cache getComplianceBook, the per-home
 *   book               slices and heldComplianceBook - a home put to let only
 *                      or rent collect is no longer ours to chase (isOurs)
 *   the tenancy dates  /api/portfolio/tenancy, over PayProp's
 *
 * Nothing here writes to REX, REX PM, PayProp or Propoly.
 */

export interface HeldOverride {
  value: unknown;
  by: string;
  at: string;
}
type Fields = Partial<Record<OverrideField, HeldOverride>>;

export const letKey = (listingId: string) => `listing:${listingId}`;
/** The key a field of the whole home is kept under: its REX property id or pm- id, else its let. */
export const homeKeyOf = (p: { propertyId: string | null; listingId: string }) => (p.propertyId ? String(p.propertyId) : letKey(String(p.listingId)));
export const keyFor = (field: OverrideField, p: { propertyId: string | null; listingId: string }) =>
  FIELD_SCOPE[field] === "home" ? homeKeyOf(p) : letKey(String(p.listingId));

let held: { at: number; byKey: Map<string, Fields> } | null = null;
const FRESH_MS = 30 * 1000;

export function forgetOverrides(): void {
  held = null;
}

type Row = { home_key: string; field: string; value: unknown; set_by: string; set_at: Date | string };

const FIELDS = new Set<string>(Object.keys(FIELD_SCOPE));

/**
 * Every override, by key. A field of the home is also put under the home's
 * twin - the REX property id and the OS record's pm- id are the same home
 * (os_properties.rex_property_id) - so the managed book and the compliance
 * book find it whichever id they know the home by. Throws on a database
 * error; the overlays below then leave the book as it was.
 */
export async function allOverrides(): Promise<Map<string, Fields>> {
  if (!hasDb()) return new Map();
  if (held && Date.now() - held.at < FRESH_MS) return held.byKey;
  const rows = await q<Row>(`SELECT home_key, field, value, set_by, set_at FROM os_home_overrides`);
  const byKey = new Map<string, Fields>();
  for (const r of rows) {
    if (!FIELDS.has(r.field)) continue;
    const f = byKey.get(r.home_key) ?? {};
    f[r.field as OverrideField] = { value: r.value, by: r.set_by, at: new Date(r.set_at).toISOString() };
    byKey.set(r.home_key, f);
  }
  const homeKeys = [...byKey.keys()].filter((k) => !k.startsWith("listing:"));
  if (homeKeys.length) {
    const twins = await q<{ id: string; rex_property_id: string | null }>(
      `SELECT id, rex_property_id FROM os_properties WHERE (id = ANY($1) OR rex_property_id = ANY($1)) AND rex_property_id IS NOT NULL AND rex_property_id <> ''`,
      [homeKeys]
    ).catch(() => []);
    for (const t of twins) {
      const a = String(t.id);
      const b = String(t.rex_property_id);
      const from = byKey.get(a) ?? byKey.get(b);
      if (!from) continue;
      for (const k of [a, b]) byKey.set(k, { ...from, ...(byKey.get(k) ?? {}) });
    }
  }
  held = { at: Date.now(), byKey };
  return byKey;
}

/** One home's overrides, read fresh: the let's own fields and the home's. */
export function fieldsOf(map: Map<string, Fields>, p: { propertyId: string | null; listingId: string }): Fields {
  const home = map.get(homeKeyOf(p)) ?? (p.propertyId ? map.get(letKey(String(p.listingId))) : undefined) ?? {};
  const let_ = map.get(letKey(String(p.listingId))) ?? {};
  const out: Fields = {};
  for (const f of Object.keys(FIELD_SCOPE) as OverrideField[]) {
    const v = FIELD_SCOPE[f] === "home" ? home[f] : let_[f];
    if (v) out[f] = v;
  }
  return out;
}

const tenantsOf = (v: unknown): OverrideTenant[] =>
  Array.isArray(v) ? (v as OverrideTenant[]).filter((t) => t && typeof t.name === "string" && t.name) : [];

/** One row of the book with the OS's answers on it, or null when it has none. */
export function applyToProperty(p: ManagedProperty, f: Fields): ManagedProperty | null {
  if (p.test || !Object.keys(f).length) return null;
  const out: ManagedProperty = { ...p };
  const marks: NonNullable<ManagedProperty["overridden"]> = {};
  const mark = (k: OverrideField, h: HeldOverride, was: string | null) => (marks[k] = { by: h.by, at: h.at, was });
  if (f.service && isServiceLevel(f.service.value)) {
    mark("service", f.service, p.service ?? null);
    out.service = SERVICE_LABEL[f.service.value];
  }
  if (f.letType && typeof f.letType.value === "string") {
    mark("letType", f.letType, p.letType ?? null);
    out.letType = f.letType.value;
  }
  if (f.tenancyStart && typeof f.tenancyStart.value === "string") {
    mark("tenancyStart", f.tenancyStart, sayDay(p.letSince));
    out.letSince = f.tenancyStart.value;
  }
  /* The end date lives on PayProp's tenancy, not the book: the tenancy route
     lays it on and says what PayProp holds. Marked here so the page knows. */
  if (f.tenancyEnd && typeof f.tenancyEnd.value === "string") mark("tenancyEnd", f.tenancyEnd, null);
  if (f.tenants) {
    const list = tenantsOf(f.tenants.value);
    mark("tenants", f.tenants, p.tenants.map((t) => t.name).join(", ") || null);
    out.tenants = list.map((t, i) => ({ contactId: osTenantId(String(p.listingId), i), name: t.name, email: t.email, phone: t.phone }));
    /* The household an agent names is who lives there, whatever PayProp's
       ended tenancy said (lib/managed-book markEmptyHomes). */
    if (list.length) out.vacantSince = undefined;
  }
  out.overridden = { ...(p.overridden ?? {}), ...marks };
  return out;
}

/** The book with every home's OS answers on it, the counts taken again where any service moved. */
export async function withHomeOverrides(book: ManagedBook): Promise<ManagedBook> {
  let map: Map<string, Fields>;
  try {
    map = await allOverrides();
  } catch {
    return book;
  }
  if (!map.size) return book;
  let changed = 0;
  /* Only a service or a tenant list moves a count (by service, managed rent
     roll, with a tenant); dates and let types leave the counts as they are. */
  let recount = false;
  const properties = book.properties.map((p) => {
    const f = fieldsOf(map, p);
    const next = applyToProperty(p, f);
    if (!next) return p;
    changed++;
    if ((f.service && next.service !== p.service) || f.tenants) recount = true;
    return next;
  });
  if (!changed) return book;
  return recount ? recountBook(book, properties) : { ...book, properties };
}

/**
 * The compliance book with the service the OS was told. Let only and rent
 * collect are the landlord's duty (isOurs drops them); Managed makes the home
 * ours even where REX PM holds no letting agreement for it, because somebody
 * who looks after the home said so. A copy: the held book is not touched, so
 * clearing the answer gives REX's straight back.
 */
export async function complianceWithOverrides(book: ComplianceBook): Promise<ComplianceBook> {
  let map: Map<string, Fields>;
  try {
    map = await allOverrides();
  } catch {
    return book;
  }
  if (!map.size) return book;
  let changed = 0;
  const properties = book.properties.map((p) => {
    const s = map.get(String(p.id))?.service?.value;
    if (!isServiceLevel(s)) return p;
    changed++;
    if (s === "managed") return { ...p, service: "Managed", rentCollect: false, managedByPm: true };
    if (s === "rent_collect") return { ...p, service: "Rent Collect", rentCollect: true };
    return { ...p, service: "Let Only", rentCollect: false };
  });
  return changed ? { ...book, properties } : book;
}

/** One home's overrides (the Edit form, the tenancy dates). Saving forgets the held copy, so a save shows at once. */
export async function overridesFor(p: { propertyId: string | null; listingId: string }): Promise<Fields> {
  return fieldsOf(await allOverrides(), p);
}

export interface Actor {
  name: string;
  email: string;
}

/**
 * Save the changes, one row per field, each in the log with what it was and
 * what it is now, in the words the screen showed. A value of null clears the
 * field, so REX's value stands again.
 */
export async function saveOverrides(
  home: { propertyId: string | null; listingId: string },
  changes: { field: OverrideField; value: unknown | null; from: string | null }[],
  by: Actor
): Promise<void> {
  for (const c of changes) {
    const key = keyFor(c.field, home);
    if (c.value == null) {
      await q(`DELETE FROM os_home_overrides WHERE home_key = $1 AND field = $2`, [key, c.field]);
    } else {
      await q(
        `INSERT INTO os_home_overrides (home_key, field, value, set_by, set_by_email, set_at)
         VALUES ($1, $2, $3::jsonb, $4, $5, NOW())
         ON CONFLICT (home_key, field) DO UPDATE SET value = EXCLUDED.value, set_by = EXCLUDED.set_by, set_by_email = EXCLUDED.set_by_email, set_at = NOW()`,
        [key, c.field, JSON.stringify(c.value), by.name, by.email]
      );
    }
    await logChange(home, c.field, c.from, c.value == null ? null : sayValue(c.field, c.value), by, c.value);
  }
  forgetOverrides();
}

/** One line in the home's log. Also for the home facts and management, saved elsewhere. */
export async function logChange(
  home: { propertyId: string | null; listingId: string },
  field: LoggedField,
  from: string | null,
  to: string | null,
  by: Actor,
  value: unknown = null
): Promise<void> {
  const key = FIELD_SCOPE[field as OverrideField] === "let" ? letKey(String(home.listingId)) : homeKeyOf(home);
  await q(
    `INSERT INTO os_home_override_log (id, home_key, listing_id, field, from_text, to_text, to_value, by_name, by_email)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)`,
    [randomUUID(), key, String(home.listingId), field, from, to, value == null ? null : JSON.stringify(value), by.name, by.email]
  );
}

/** What has been changed on this home, newest first: its own fields, and this let's. */
export async function overrideLog(home: { propertyId: string | null; listingId: string }, limit = 40): Promise<OverrideLogEntry[]> {
  if (!hasDb()) return [];
  const keys = [homeKeyOf(home), letKey(String(home.listingId))];
  const rows = await q<{ id: string; field: string; from_text: string | null; to_text: string | null; by_name: string; at: Date | string }>(
    `SELECT id, field, from_text, to_text, by_name, at FROM os_home_override_log
      WHERE home_key = ANY($1) OR listing_id = $2 ORDER BY at DESC LIMIT $3`,
    [keys, String(home.listingId), limit]
  );
  return rows.map((r) => ({ id: r.id, field: r.field as LoggedField, from: r.from_text, to: r.to_text, by: r.by_name, at: new Date(r.at).toISOString() }));
}
