import { hasDb, q } from "@/lib/db";

/**
 * Leads taken off the board by hand (James, 11 Sep 2026: "we should have the
 * ability to delete that if it was required"). REX is read-only, so nothing
 * is deleted there: the OS remembers the id and stops showing it. Undo is
 * deleting the row.
 */
export async function hiddenLeadIds(): Promise<Set<string>> {
  if (!hasDb()) return new Set();
  const rows = await q<{ id: string }>(`SELECT id FROM os_hidden_leads`).catch(() => []);
  return new Set(rows.map((r) => r.id));
}

export async function hideLead(id: string, by: string | null): Promise<void> {
  await q(
    `INSERT INTO os_hidden_leads (id, hidden_by) VALUES ($1, $2)
     ON CONFLICT (id) DO UPDATE SET hidden_by = EXCLUDED.hidden_by, hidden_at = NOW()`,
    [id, by]
  );
}

export async function unhideLead(id: string): Promise<void> {
  await q(`DELETE FROM os_hidden_leads WHERE id = $1`, [id]);
}
