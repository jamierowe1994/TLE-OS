import "server-only";
import { hasDb, q } from "@/lib/db";
import { uid } from "@/lib/auth";

/**
 * Custom attributes — fields a person invents for themselves.
 *
 * ── Why they are PER PERSON ───────────────────────────────────────────────
 *
 * James: "they will stay personal to that account." That is the right call and
 * worth defending. One agent tracking "Boiler serviced?" must not put that
 * column on everybody else's leads, because the moment a field is shared it
 * becomes a field forty people are ignoring — and a CRM full of empty columns
 * teaches everyone to stop reading the ones that matter.
 *
 * ── Why definitions and values are separate tables ────────────────────────
 *
 * Different lifetimes. Rename a field and every value it holds should follow
 * without being rewritten; delete a lead and its values go while the definition
 * stays for the next one. One table with the label on every row makes a rename
 * an UPDATE across the whole history, and gets it half-done the first time it
 * fails midway.
 *
 * ── Three kinds, and no more for now ──────────────────────────────────────
 *
 * text, yes/no, and a dropdown. Between them they cover what an agent actually
 * writes on a file. Dates and numbers are the obvious next two and are
 * deliberately absent: each one needs its own filter behaviour ("after", "more
 * than"), and adding a kind whose filter is a text match makes the filter lie.
 */

export const ENTITIES = ["leads", "listings", "viewings", "market_appraisals"] as const;
export type AttrEntity = (typeof ENTITIES)[number];

export const ENTITY_LABEL: Record<AttrEntity, string> = {
  leads: "Leads",
  listings: "Listings",
  viewings: "Viewings",
  market_appraisals: "Market Appraisals",
};

export const KINDS = ["text", "yesno", "select"] as const;
export type AttrKind = (typeof KINDS)[number];

export const KIND_LABEL: Record<AttrKind, string> = {
  text: "Written answer",
  yesno: "Yes or no",
  select: "Pick from a list",
};

export interface AttrDef {
  id: string;
  entity: AttrEntity;
  label: string;
  kind: AttrKind;
  options: string[];
  position: number;
}

export async function defsFor(ownerId: string, entity?: AttrEntity): Promise<AttrDef[]> {
  if (!hasDb()) return [];
  const rows = await q<{
    id: string; entity: string; label: string; kind: string;
    options: string[] | null; position: number;
  }>(
    entity
      ? `select id, entity, label, kind, options, position from os_attr_defs
           where owner_id = $1 and entity = $2 order by position, created_at`
      : `select id, entity, label, kind, options, position from os_attr_defs
           where owner_id = $1 order by entity, position, created_at`,
    entity ? [ownerId, entity] : [ownerId]
  );
  return rows.map((r) => ({
    id: r.id,
    entity: r.entity as AttrEntity,
    label: r.label,
    kind: (KINDS as readonly string[]).includes(r.kind) ? (r.kind as AttrKind) : "text",
    options: Array.isArray(r.options) ? r.options : [],
    position: r.position,
  }));
}

export async function addDef(p: {
  ownerId: string; entity: AttrEntity; label: string; kind: AttrKind; options?: string[];
}): Promise<void> {
  if (!hasDb()) return;
  const next = await q<{ n: string }>(
    `select coalesce(max(position), -1) + 1 as n from os_attr_defs where owner_id = $1 and entity = $2`,
    [p.ownerId, p.entity]
  );
  await q(
    `insert into os_attr_defs (id, owner_id, entity, label, kind, options, position)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [
      uid(), p.ownerId, p.entity, p.label.trim(), p.kind,
      p.kind === "select" ? JSON.stringify(p.options ?? []) : null,
      Number(next[0]?.n ?? 0),
    ]
  );
}

/** Deleting a definition takes its values with it — there is nothing to keep. */
export async function removeDef(ownerId: string, id: string): Promise<void> {
  if (!hasDb()) return;
  const mine = await q<{ id: string }>(
    `select id from os_attr_defs where id = $1 and owner_id = $2`, [id, ownerId]
  );
  if (!mine.length) return;
  await q(`delete from os_attr_values where def_id = $1`, [id]);
  await q(`delete from os_attr_defs where id = $1`, [id]);
}

/** Every value this person has recorded against one record. */
export async function valuesFor(ownerId: string, recordId: string): Promise<Record<string, string>> {
  if (!hasDb()) return {};
  const rows = await q<{ def_id: string; value: string }>(
    `select v.def_id, v.value from os_attr_values v
       join os_attr_defs d on d.id = v.def_id
      where d.owner_id = $1 and v.record_id = $2`,
    [ownerId, recordId]
  );
  return Object.fromEntries(rows.map((r) => [r.def_id, r.value]));
}

export async function setValue(ownerId: string, defId: string, recordId: string, value: string): Promise<void> {
  if (!hasDb()) return;
  /* Ownership checked on the DEFINITION, not passed in. Otherwise anybody who
     learned a def_id could write onto somebody else's field. */
  const mine = await q<{ id: string }>(
    `select id from os_attr_defs where id = $1 and owner_id = $2`, [defId, ownerId]
  );
  if (!mine.length) return;
  await q(
    `insert into os_attr_values (def_id, record_id, value, updated_at)
     values ($1,$2,$3,now())
     on conflict (def_id, record_id) do update set value = excluded.value, updated_at = now()`,
    [defId, recordId, value]
  );
}

/** Record ids matching a value — the filter. */
export async function recordsMatching(ownerId: string, defId: string, value: string): Promise<string[]> {
  if (!hasDb()) return [];
  const rows = await q<{ record_id: string }>(
    `select v.record_id from os_attr_values v
       join os_attr_defs d on d.id = v.def_id
      where d.owner_id = $1 and v.def_id = $2 and v.value ilike $3`,
    [ownerId, defId, value]
  );
  return rows.map((r) => r.record_id);
}
