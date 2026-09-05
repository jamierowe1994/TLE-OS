import "server-only";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { DATA_DIR } from "@/lib/business/data-dir";
import { hasDb, q } from "@/lib/business/db";
import { q as osq } from "@/lib/db";

// Assistant knowledge store — the head-office briefing library Susan curates
// from Admin → Assistant. Every entry is handed to the TLE Assistant as
// context, so agents' questions can be answered with TLE's own guidance
// (fee structures, processes, policies, how-tos).
//
// Dual backend like the other stores: Postgres (`assistant_knowledge`,
// schema in lib/db.ts) when DATABASE_URL is set, otherwise knowledge.json
// under DATA_DIR.

export interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
  updatedAt: string; // ISO
  /** The shelf it files under. OS-side (os_knowledge_meta). */
  section: string;
  /** On Steve's Guides shelf for agents, as well as in his head. */
  guide: boolean;
  updatedBy: string;
}

/** The shelves, in the order they draw. Free text is allowed; these are the defaults offered. */
export const KNOWLEDGE_SECTIONS = [
  "How we work",
  "Fees and terms",
  "Compliance",
  "Pre-tenancy and move-in",
  "Marketing",
  "The system",
] as const;

export const DEFAULT_SECTION = KNOWLEDGE_SECTIONS[0];

// Guardrails so one giant paste can't blow the assistant's context.
export const KNOWLEDGE_MAX_ENTRY_CHARS = 20_000;
export const KNOWLEDGE_MAX_TITLE_CHARS = 200;

/* ------------------------------------------------------------------------ */
/* Postgres                                                                  */
/* ------------------------------------------------------------------------ */

interface KnowledgeRow extends Record<string, unknown> {
  id: string;
  title: string;
  content: string;
  updated_at: string | Date;
}

interface MetaRow extends Record<string, unknown> {
  entry_id: string;
  section: string;
  is_guide: boolean;
  updated_by: string;
}

function rowToEntry(row: KnowledgeRow, meta?: MetaRow): KnowledgeEntry {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    updatedAt: new Date(row.updated_at).toISOString(),
    section: meta?.section || DEFAULT_SECTION,
    guide: Boolean(meta?.is_guide),
    updatedBy: meta?.updated_by ?? "",
  };
}

async function metaById(): Promise<Map<string, MetaRow>> {
  const rows = await osq<MetaRow>(`SELECT entry_id, section, is_guide, updated_by FROM os_knowledge_meta`).catch(
    () => [] as MetaRow[]
  );
  return new Map(rows.map((r) => [r.entry_id, r]));
}

/* ------------------------------------------------------------------------ */
/* JSON fallback                                                             */
/* ------------------------------------------------------------------------ */

const FILE = path.join(DATA_DIR, "knowledge.json");

async function readAllFile(): Promise<KnowledgeEntry[]> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as KnowledgeEntry[]) : [];
  } catch {
    return [];
  }
}

async function writeAllFile(rows: KnowledgeEntry[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(rows, null, 2), "utf8");
}

/* ------------------------------------------------------------------------ */
/* Store API                                                                 */
/* ------------------------------------------------------------------------ */

/** Every entry, most recently updated first. */
export async function listKnowledge(): Promise<KnowledgeEntry[]> {
  if (hasDb()) {
    const [rows, meta] = await Promise.all([
      q<KnowledgeRow>("SELECT id, title, content, updated_at FROM assistant_knowledge ORDER BY updated_at DESC"),
      metaById(),
    ]);
    return rows.map((r) => rowToEntry(r, meta.get(r.id)));
  }
  const rows = await readAllFile();
  return rows
    .map((r) => ({ ...r, section: r.section || DEFAULT_SECTION, guide: Boolean(r.guide), updatedBy: r.updatedBy ?? "" }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getKnowledge(id: string): Promise<KnowledgeEntry | null> {
  const all = await listKnowledge();
  return all.find((e) => e.id === id) ?? null;
}

/** Create (no id) or update (with id). Trims + clamps to the guardrails. */
export async function upsertKnowledge(input: {
  id?: string | null;
  title: string;
  content: string;
  section?: string | null;
  guide?: boolean;
  updatedBy?: string;
}): Promise<KnowledgeEntry> {
  const entry: KnowledgeEntry = {
    id: input.id?.trim() || crypto.randomUUID(),
    title: input.title.trim().slice(0, KNOWLEDGE_MAX_TITLE_CHARS),
    content: input.content.trim().slice(0, KNOWLEDGE_MAX_ENTRY_CHARS),
    updatedAt: new Date().toISOString(),
    section: (input.section ?? "").trim().slice(0, 60) || DEFAULT_SECTION,
    guide: Boolean(input.guide),
    updatedBy: (input.updatedBy ?? "").slice(0, 200),
  };
  if (!entry.title || !entry.content) {
    throw new Error("A knowledge entry needs both a title and some content.");
  }

  if (hasDb()) {
    await q(
      `INSERT INTO assistant_knowledge (id, title, content, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (id) DO UPDATE
         SET title = EXCLUDED.title, content = EXCLUDED.content, updated_at = NOW()`,
      [entry.id, entry.title, entry.content]
    );
    await osq(
      `INSERT INTO os_knowledge_meta (entry_id, section, is_guide, updated_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (entry_id) DO UPDATE
         SET section = EXCLUDED.section, is_guide = EXCLUDED.is_guide,
             updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      [entry.id, entry.section, entry.guide, entry.updatedBy]
    );
    return entry;
  }

  const rows = await readAllFile();
  const idx = rows.findIndex((r) => r.id === entry.id);
  if (idx >= 0) rows[idx] = entry;
  else rows.push(entry);
  await writeAllFile(rows);
  return entry;
}

export async function deleteKnowledge(id: string): Promise<boolean> {
  if (hasDb()) {
    const rows = await q<{ id: string }>(
      "DELETE FROM assistant_knowledge WHERE id = $1 RETURNING id",
      [id]
    );
    await osq(`DELETE FROM os_knowledge_meta WHERE entry_id = $1`, [id]).catch(() => []);
    return rows.length > 0;
  }
  const rows = await readAllFile();
  const next = rows.filter((r) => r.id !== id);
  if (next.length === rows.length) return false;
  await writeAllFile(next);
  return true;
}
