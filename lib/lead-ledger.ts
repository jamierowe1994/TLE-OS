import "server-only";
import { hasDb, q } from "@/lib/db";
import type { Lead } from "@/lib/leads-sample";

/**
 * The lead ledger: every enquiry the OS has ever seen, kept.
 *
 * James, 7 Sep 2026: "we cannot forget anything that comes into the system
 * ... we're meant to be making REX slowly irrelevant, so we need to store the
 * data." Until now the board was a cache of REX's newest 500 leads that the
 * next scan overwrote; a lead that scrolled off the 500 was gone from the OS.
 *
 * One row per REX lead, written on every scan (the page's own and the
 * five-minute cron's), never deleted. First seen, last seen, the facts the
 * board sorts and filters on as columns, the whole board object as payload.
 * The board reads the newest rows from here, so it keeps growing past what
 * a single scan of REX can show.
 */

export interface LedgerStats {
  onFile: number;
  since: string | null;
}

export async function recordLeads(leads: Lead[]): Promise<number> {
  if (!hasDb() || !leads.length) return 0;
  const cols: unknown[][] = leads.map((l) => [
    l.id,
    l.receivedAt ?? null,
    l.source,
    l.enquiry,
    l.stage,
    l.name,
    l.email || null,
    l.phone || null,
    l.listingId != null ? String(l.listingId) : null,
    l.contactId ?? null,
    l.assigneeId ?? null,
    l.agent,
    l.address ?? null,
    JSON.stringify(l),
  ]);
  /* One statement for the lot: 500 rows a scan, every five minutes. */
  const values = cols.map((_, i) => `(${cols[0].map((__, j) => `$${i * cols[0].length + j + 1}`).join(", ")})`).join(",\n");
  await q(
    `INSERT INTO os_leads (id, received_at, source, enquiry, stage, name, email, phone, listing_id, contact_id, assignee_id, agent, address, payload)
     VALUES ${values}
     ON CONFLICT (id) DO UPDATE SET
       stage = EXCLUDED.stage, name = EXCLUDED.name, email = EXCLUDED.email, phone = EXCLUDED.phone,
       listing_id = EXCLUDED.listing_id, contact_id = EXCLUDED.contact_id, assignee_id = EXCLUDED.assignee_id,
       agent = EXCLUDED.agent, address = EXCLUDED.address, payload = EXCLUDED.payload, last_seen = NOW()`,
    cols.flat()
  );
  return leads.length;
}

/** The newest leads on file, the whole business or one agent's. */
export async function ledgerBoard(rexUserId: string | null, limit = 500): Promise<Lead[]> {
  if (!hasDb()) return [];
  const rows = await q<{ payload: Lead }>(
    rexUserId
      ? `SELECT payload FROM os_leads WHERE assignee_id = $2 ORDER BY received_at DESC NULLS LAST LIMIT $1`
      : `SELECT payload FROM os_leads ORDER BY received_at DESC NULLS LAST LIMIT $1`,
    rexUserId ? [limit, rexUserId] : [limit]
  ).catch(() => []);
  return rows.map((r) => r.payload);
}

export async function ledgerStats(): Promise<LedgerStats> {
  if (!hasDb()) return { onFile: 0, since: null };
  const rows = await q<{ n: string; since: Date | null }>(`SELECT COUNT(*)::text AS n, MIN(first_seen) AS since FROM os_leads`).catch(() => []);
  return { onFile: Number(rows[0]?.n ?? 0), since: rows[0]?.since ? new Date(rows[0].since).toISOString() : null };
}

/** Every lead on file for one listing, newest first: the property's own enquiries. */
export async function leadsForListing(listingId: string, limit = 100): Promise<Lead[]> {
  if (!hasDb()) return [];
  const rows = await q<{ payload: Lead }>(
    `SELECT payload FROM os_leads WHERE listing_id = $1 ORDER BY received_at DESC NULLS LAST LIMIT $2`,
    [listingId, limit]
  ).catch(() => []);
  return rows.map((r) => r.payload);
}
