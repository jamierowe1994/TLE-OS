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
       agent = EXCLUDED.agent, address = EXCLUDED.address,
       /* The scan's payload wins, except for the enquiry read in full from
          REX (/api/leads/[id]/enquiry): the scan only ever sees REX's
          100-character snippet, and must not write it back over the whole
          message. jsonb_strip_nulls drops the keys a lead never had. */
       payload = EXCLUDED.payload || jsonb_strip_nulls(jsonb_build_object(
         'enquiryFull', os_leads.payload->'enquiryFull',
         'enquiryFields', os_leads.payload->'enquiryFields',
         'enquirySource', os_leads.payload->'enquirySource',
         'enquiryV', os_leads.payload->'enquiryV')),
       last_seen = NOW()`,
    cols.flat()
  );
  return leads.length;
}

/**
 * Sales valuations already on file, before the scan learned to set them aside
 * (lib/rex-leads isSalesValuation). Read from what the row holds - the
 * snippet, and the whole enquiry once somebody has opened it - so a lead
 * opened for the first time drops off the board if it turns out to be a sale.
 * The same pattern as the scan's, in Postgres's words.
 */
const NOT_SALES = `NOT (
  COALESCE(source, '') ILIKE '%getagent%'
  OR (COALESCE(enquiry, '') = 'Valuation'
      AND concat_ws(' ', payload->>'subject', payload->>'enquiryMessage', payload->>'enquiryFull', payload->>'enquiryFields')
          ~* '(enquiry type:\\s*sales|\\mfor sale\\M|\\mvendor\\M|estimated value|quoted fee)')
)`;

/**
 * Every lead on file that reads as a sale (see NOT_SALES), for the board to
 * drop whichever way it came - the scan's REX book carries only REX's short
 * snippet, which never says "sales", so the board has to ask the ledger.
 */
export async function salesLeadIds(): Promise<Set<string>> {
  if (!hasDb()) return new Set();
  const rows = await q<{ id: string }>(`SELECT id FROM os_leads WHERE NOT ${NOT_SALES}`).catch(() => []);
  return new Set(rows.map((r) => r.id));
}

/**
 * Read the whole enquiry for new valuation requests, at the scan - not when
 * somebody first opens one. Only the full message says "Enquiry type: sales"
 * (19 Sep 2026: Sunny Brar and Cheryl M Jennings sat on the board as landlord
 * leads for a day). A handful a day, twenty a run at most, READ-ONLY on REX.
 */
export async function readNewValuations(limit = 20): Promise<number> {
  if (!hasDb()) return 0;
  const { readEnquiry, ENQUIRY_VERSION } = await import("@/lib/rex-enquiry");
  const rows = await q<{ id: string }>(
    `SELECT id FROM os_leads
      WHERE id LIKE 'rex-%' AND enquiry = 'Valuation'
        AND (payload->>'enquiryFull' IS NULL OR COALESCE((payload->>'enquiryV')::int, 0) <> $1)
        AND COALESCE(received_at, first_seen) > NOW() - INTERVAL '120 days'
      ORDER BY received_at DESC NULLS LAST LIMIT $2`,
    [ENQUIRY_VERSION, limit]
  ).catch(() => []);
  let n = 0;
  for (const r of rows) {
    const e = await readEnquiry(r.id.slice(4)).catch(() => null);
    if (!e) continue;
    await q(
      `UPDATE os_leads SET payload = payload || jsonb_build_object('enquiryFull', $2::text, 'enquiryFields', $3::jsonb, 'enquirySource', $4::text, 'enquiryV', $5::int) WHERE id = $1`,
      [r.id, e.message, JSON.stringify(e.fields), e.source, ENQUIRY_VERSION]
    ).catch(() => {});
    n++;
  }
  return n;
}

/** The newest leads on file, the whole business or one agent's. Lettings only. */
export async function ledgerBoard(rexUserId: string | null, limit = 500): Promise<Lead[]> {
  if (!hasDb()) return [];
  const rows = await q<{ payload: Lead }>(
    rexUserId
      ? `SELECT payload FROM os_leads WHERE assignee_id = $2 AND ${NOT_SALES} ORDER BY received_at DESC NULLS LAST LIMIT $1`
      : `SELECT payload FROM os_leads WHERE ${NOT_SALES} ORDER BY received_at DESC NULLS LAST LIMIT $1`,
    rexUserId ? [limit, rexUserId] : [limit]
  ).catch(() => []);
  return rows.map((r) => r.payload);
}

/**
 * Every lead on file matching what was typed, not just the newest 500 the
 * board loads (Susan, 19 Sep 2026: "if a lead is missing, you don't want to
 * have to click through every single person to find it"). Name, email,
 * address, the agent it is for, and the phone by its digits alone. Lettings
 * only, one agent's or the business's, newest first.
 */
export async function searchLedger(rexUserId: string | null, needle: string, limit = 60): Promise<Lead[]> {
  const text = needle.trim();
  if (!hasDb() || text.length < 3) return [];
  const like = `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const digits = text.replace(/\D/g, "");
  const params: unknown[] = [like, digits.length >= 5 ? `%${digits}%` : null, limit];
  if (rexUserId) params.push(rexUserId);
  const rows = await q<{ payload: Lead }>(
    `SELECT payload FROM os_leads
      WHERE ${NOT_SALES}
        ${rexUserId ? "AND assignee_id = $4" : ""}
        AND (name ILIKE $1 OR email ILIKE $1 OR address ILIKE $1 OR agent ILIKE $1
             OR payload->>'area' ILIKE $1
             OR ($2::text IS NOT NULL AND regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') LIKE $2))
      ORDER BY received_at DESC NULLS LAST LIMIT $3`,
    params
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
