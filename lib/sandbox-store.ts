import "server-only";
import { hasDb, q } from "@/lib/db";
import { SANDBOX_KINDS, seedFor, type SandboxKind, type SandboxRecord } from "@/lib/sandbox";

/**
 * Where sandbox records live.
 *
 * One table, one row per record, keyed by the `sbx_` id. Kept apart from every
 * real table on purpose: a sandbox row that sits alongside live data is one
 * bad WHERE clause away from being counted in a figure Susan reads.
 *
 * SEED AND REWIND ARE THE SAME OPERATION. Seeding a kind deletes that kind
 * first, so pressing it twice replaces rather than accumulates and there is no
 * drift to reason about. "Rewind" is simply seed-again, and "clear" is the
 * delete without the insert.
 *
 * Rewinding one kind never touches another — you can reset market appraisals
 * mid-experiment without losing the leads you were driving them with.
 */

const TABLE = "os_sandbox";

async function ensure(): Promise<boolean> {
  if (!hasDb()) return false;
  try {
    await q(`
      CREATE TABLE IF NOT EXISTS ${TABLE} (
        id          TEXT PRIMARY KEY,
        kind        TEXT NOT NULL,
        label       TEXT NOT NULL,
        data        JSONB NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await q(`CREATE INDEX IF NOT EXISTS ${TABLE}_kind ON ${TABLE} (kind)`);
    return true;
  } catch {
    return false;
  }
}

type Row = { id: string; kind: string; label: string; data: Record<string, unknown>; created_at: Date | string };

const toRecord = (r: Row): SandboxRecord => ({
  id: r.id,
  kind: r.kind as SandboxKind,
  label: r.label,
  data: r.data,
  createdAt: new Date(r.created_at).toISOString(),
});

export async function listSandbox(kind?: SandboxKind): Promise<SandboxRecord[]> {
  if (!(await ensure())) return [];
  const rows = await q<Row>(
    kind
      ? `SELECT * FROM ${TABLE} WHERE kind = $1 ORDER BY id`
      : `SELECT * FROM ${TABLE} ORDER BY kind, id`,
    kind ? [kind] : []
  ).catch(() => []);
  return rows.map(toRecord);
}

/** Counts per kind, so the admin page can say what is currently out there. */
export async function sandboxCounts(): Promise<Record<string, number>> {
  if (!(await ensure())) return {};
  const rows = await q<{ kind: string; n: string }>(
    `SELECT kind, COUNT(*)::text AS n FROM ${TABLE} GROUP BY kind`
  ).catch(() => []);
  return Object.fromEntries(rows.map((r) => [r.kind, Number(r.n)]));
}

/** Seed — which is also rewind, because it clears the kind first. */
export async function seedSandbox(kind: SandboxKind): Promise<SandboxRecord[]> {
  if (!(await ensure())) throw new Error("No database configured — set DATABASE_URL.");
  const records = seedFor(kind);
  await q(`DELETE FROM ${TABLE} WHERE kind = $1`, [kind]);
  for (const r of records) {
    await q(
      `INSERT INTO ${TABLE} (id, kind, label, data) VALUES ($1, $2, $3, $4)`,
      [r.id, r.kind, r.label, JSON.stringify(r.data)]
    );
  }
  return records;
}

/** Clear one kind, or everything. Only ever touches the sandbox table. */
export async function clearSandbox(kind?: SandboxKind): Promise<number> {
  if (!(await ensure())) return 0;
  const rows = await q<{ id: string }>(
    kind ? `DELETE FROM ${TABLE} WHERE kind = $1 RETURNING id` : `DELETE FROM ${TABLE} RETURNING id`,
    kind ? [kind] : []
  ).catch(() => []);
  return rows.length;
}

export const ALL_KINDS = SANDBOX_KINDS.map((k) => k.id);
