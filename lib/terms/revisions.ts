import "server-only";
import { hasDb, q } from "@/lib/db";
import { EDITIONS, baseEditionId, edition, registerRevisions, sendingEditionId } from "@/lib/terms/catalogue";
import { revisedDoc, type Change, type ESection } from "@/lib/terms/edit";
import type { Country, Section, TermsDoc } from "@/lib/terms/types";

/**
 * The saved versions of the Terms of Business, and the working copies
 * (James, 26 Nov 2026; My Business > Contracts).
 *
 * A saved version is never changed or deleted. A contract stores the id it
 * went out on ("england-nov26~r3"), so one already sent or signed keeps its
 * wording whatever is saved after it; only contracts made from then on take
 * the new one.
 *
 * `ensureRevisions` loads them into lib/terms/catalogue, which the rest of the
 * terms code reads with plain function calls. It is awaited wherever a
 * contract row is read (lib/terms/store) or made (lib/terms/flow), so those
 * look-ups always see what is saved. Without a database, or with nothing
 * saved, the catalogue answers exactly as it did before.
 */

interface Raw extends Record<string, unknown> {
  id: string;
  edition: string;
  n: number;
  country: string;
  sections: Section[];
  changes: Change[];
  note: string;
  created_by: string;
  created_at: string | Date;
}

export interface Revision {
  id: string;
  edition: string;
  n: number;
  country: Country;
  changes: Change[];
  note: string;
  by: string;
  at: string;
}

const iso = (v: string | Date) => (v instanceof Date ? v.toISOString() : new Date(v).toISOString());

let loadedAt = 0;
let loading: Promise<void> | null = null;
/** How long a load is trusted. A save on this container loads again at once. */
const FRESH_MS = 20_000;

async function load(): Promise<void> {
  const rows = await q<Raw>(`SELECT id, edition, n, country, sections, created_at FROM os_terms_revisions ORDER BY edition, n`);
  const docs: TermsDoc[] = [];
  const latest: Record<string, string> = {};
  for (const r of rows) {
    const base = EDITIONS[r.edition];
    if (!base) continue;
    docs.push(revisedDoc(base, r.n, r.sections, iso(r.created_at)));
    latest[r.edition] = r.id;
  }
  registerRevisions(docs, latest, true);
  loadedAt = Date.now();
}

/** Make the catalogue see every saved version. Never throws: a failed load leaves what was there. */
export async function ensureRevisions(force = false): Promise<void> {
  if (!hasDb()) return;
  if (!force && Date.now() - loadedAt < FRESH_MS) return;
  loading ??= load()
    .catch((e) => console.error("[terms] the saved contract versions could not be loaded", e))
    .finally(() => {
      loading = null;
    });
  await loading;
}

/** A contract row on a version this container has not loaded yet: load again. */
export async function ensureRevisionFor(version: string): Promise<void> {
  await ensureRevisions();
  if (version.includes("~r") && !known(version)) await ensureRevisions(true);
}

const known = (version: string): boolean => Boolean(edition(version));

export async function listRevisions(country: Country): Promise<Revision[]> {
  if (!hasDb()) return [];
  const rows = await q<Raw>(`SELECT id, edition, n, country, changes, note, created_by, created_at FROM os_terms_revisions WHERE country = $1 ORDER BY created_at DESC LIMIT 60`, [country]);
  return rows.map((r) => ({ id: r.id, edition: r.edition, n: r.n, country: r.country as Country, changes: r.changes ?? [], note: r.note, by: r.created_by, at: iso(r.created_at) }));
}

export async function revisionSections(id: string): Promise<Section[] | null> {
  if (!hasDb()) return null;
  const rows = await q<Raw>(`SELECT sections FROM os_terms_revisions WHERE id = $1`, [id]);
  return rows[0]?.sections ?? null;
}

/**
 * Save a new version of the edition agents send for a country. The number is
 * taken inside the insert, so two saves at once cannot share one. Returns the
 * new id.
 */
export async function publishRevision(country: Country, sections: Section[], changes: Change[], note: string, by: string): Promise<string> {
  if (!hasDb()) throw new Error("No database on this environment.");
  const editionId = sendingEditionId(country);
  if (!editionId || !EDITIONS[editionId]) throw new Error("There are no terms for that country yet.");
  const rows = await q<{ id: string }>(
    `INSERT INTO os_terms_revisions (id, edition, n, country, sections, changes, note, created_by)
     SELECT $1 || '~r' || next.n, $1, next.n, $2, $3::jsonb, $4::jsonb, $5, $6
       FROM (SELECT COALESCE(MAX(n), 0) + 1 AS n FROM os_terms_revisions WHERE edition = $1) next
     RETURNING id`,
    [editionId, country, JSON.stringify(sections), JSON.stringify(changes), note.slice(0, 500), by]
  );
  await ensureRevisions(true);
  return rows[0].id;
}

/* ------------------------------- working copies ------------------------------- */

export interface ChatLine {
  who: "you" | "assistant";
  text: string;
  at: string;
}

export interface Draft {
  country: Country;
  /** The published contract it started from: a save elsewhere since makes it stale. */
  fromId: string;
  sections: ESection[];
  ticks: string[];
  chat: ChatLine[];
  by: string;
  at: string;
}

interface DraftRaw extends Record<string, unknown> {
  country: string;
  from_id: string;
  sections: ESection[];
  ticks: string[];
  chat: ChatLine[];
  updated_by: string;
  updated_at: string | Date;
}

export async function getDraft(country: Country): Promise<Draft | null> {
  if (!hasDb()) return null;
  const rows = await q<DraftRaw>(`SELECT * FROM os_terms_drafts WHERE country = $1`, [country]);
  const r = rows[0];
  return r ? { country, fromId: r.from_id, sections: r.sections, ticks: r.ticks ?? [], chat: r.chat ?? [], by: r.updated_by, at: iso(r.updated_at) } : null;
}

export async function saveDraft(d: Omit<Draft, "at">): Promise<void> {
  if (!hasDb()) throw new Error("No database on this environment.");
  await q(
    `INSERT INTO os_terms_drafts (country, from_id, sections, ticks, chat, updated_by, updated_at)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6, NOW())
     ON CONFLICT (country) DO UPDATE SET from_id = EXCLUDED.from_id, sections = EXCLUDED.sections, ticks = EXCLUDED.ticks,
       chat = EXCLUDED.chat, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [d.country, d.fromId, JSON.stringify(d.sections), JSON.stringify(d.ticks), JSON.stringify(d.chat.slice(-60)), d.by]
  );
}

export async function dropDraft(country: Country): Promise<void> {
  if (!hasDb()) return;
  await q(`DELETE FROM os_terms_drafts WHERE country = $1`, [country]);
}

export { baseEditionId };
