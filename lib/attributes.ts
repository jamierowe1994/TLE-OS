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

/**
 * `tenant_passport` is not like the other four.
 *
 * The rest are columns an agent adds to their own records, answered by that
 * agent. A passport question is answered by a TENANT, on a public form, and it
 * is the only entity where the person filling it in has never seen the OS. Two
 * things follow, and both are handled below rather than left to callers:
 *
 *  - `required` means something here and nowhere else. Marking a lead field
 *    mandatory would be a rule with nothing to enforce it; marking a passport
 *    question mandatory stops the tenant submitting without it.
 *  - The answers are keyed on the passport's token, and written by somebody
 *    with no session at all - see `setPassportAnswer`.
 */
export const ENTITIES = [
  "leads",
  "listings",
  "viewings",
  "market_appraisals",
  "tenant_passport",
] as const;
export type AttrEntity = (typeof ENTITIES)[number];

export const ENTITY_LABEL: Record<AttrEntity, string> = {
  leads: "Leads",
  listings: "Listings",
  viewings: "Viewings",
  market_appraisals: "Market Appraisals",
  tenant_passport: "Tenant passport",
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
  /** Tenant passport only: the form will not submit without an answer. */
  required: boolean;
}

const COLS = `id, entity, label, kind, options, position, required`;

type DefRow = {
  id: string; entity: string; label: string; kind: string;
  options: string[] | null; position: number; required: boolean | null;
};

const toDef = (r: DefRow): AttrDef => ({
  id: r.id,
  entity: r.entity as AttrEntity,
  label: r.label,
  kind: (KINDS as readonly string[]).includes(r.kind) ? (r.kind as AttrKind) : "text",
  options: Array.isArray(r.options) ? r.options : [],
  position: r.position,
  required: r.required === true,
});

export async function defsFor(ownerId: string, entity?: AttrEntity): Promise<AttrDef[]> {
  if (!hasDb()) return [];
  const rows = await q<DefRow>(
    entity
      ? `select ${COLS} from os_attr_defs
           where owner_id = $1 and entity = $2 order by position, created_at`
      : `select ${COLS} from os_attr_defs
           where owner_id = $1 order by entity, position, created_at`,
    entity ? [ownerId, entity] : [ownerId]
  );
  return rows.map(toDef);
}

export async function addDef(p: {
  ownerId: string; entity: AttrEntity; label: string; kind: AttrKind;
  options?: string[]; required?: boolean;
}): Promise<void> {
  if (!hasDb()) return;
  const next = await q<{ n: string }>(
    `select coalesce(max(position), -1) + 1 as n from os_attr_defs where owner_id = $1 and entity = $2`,
    [p.ownerId, p.entity]
  );
  await q(
    `insert into os_attr_defs (id, owner_id, entity, label, kind, options, position, required)
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      uid(), p.ownerId, p.entity, p.label.trim(), p.kind,
      p.kind === "select" ? JSON.stringify(p.options ?? []) : null,
      Number(next[0]?.n ?? 0),
      /* Only the passport can enforce it, so only the passport can set it.
         A "mandatory" lead field would be a promise nothing keeps. */
      p.entity === "tenant_passport" && p.required === true,
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

/* ── The tenant side ──────────────────────────────────────────────────────
 *
 * Everything above is called by somebody with a session, and scoped to them.
 * A tenant filling in a passport has no session at all: their link IS their
 * credential. So these two take the OWNING AGENT's id, which the caller reads
 * off the passport row rather than off a cookie or a request body.
 *
 * That is the whole safety property, and it is worth saying plainly: a tenant
 * can only ever see and answer the questions belonging to the agent whose
 * passport they were sent. If that agent has written none, the passport gains
 * nothing - which is exactly what James asked for, and it falls out of the
 * ownership scoping rather than needing a rule of its own.
 */

/** The questions an agent has bolted onto their passports. */
export async function passportQuestions(agentId: string | null): Promise<AttrDef[]> {
  if (!agentId) return [];
  return defsFor(agentId, "tenant_passport");
}

/**
 * A tenant's answer to one of those questions.
 *
 * `agentId` comes from the passport row, and the def is checked to belong to
 * that agent before anything is written - so a token cannot be used to write
 * onto another agent's question by guessing its id.
 */
export async function setPassportAnswer(
  agentId: string,
  defId: string,
  token: string,
  value: string
): Promise<void> {
  if (!hasDb()) return;
  const mine = await q<{ id: string }>(
    `select id from os_attr_defs where id = $1 and owner_id = $2 and entity = 'tenant_passport'`,
    [defId, agentId]
  );
  if (!mine.length) return;
  await q(
    `insert into os_attr_values (def_id, record_id, value, updated_at)
     values ($1,$2,$3,now())
     on conflict (def_id, record_id) do update set value = excluded.value, updated_at = now()`,
    [defId, token, value]
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
