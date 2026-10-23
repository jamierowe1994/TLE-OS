import "server-only";
import crypto from "node:crypto";
import { hasDb, q } from "@/lib/db";

/**
 * WHAT A TENANT SENDS US.
 *
 * The tenant portal's Documents page has been entirely outbound - things they
 * receive - and the screen docs said so: one file field on their profile, and
 * nothing flowing into the OS. This is the way in. F1.12, the other half of J6.
 *
 * Deliberately the same shape as lib/landlord-account's document store, down to
 * the column names, because it is the same problem for the other customer. The
 * row is an index; the bytes live in R2. Keyed on the portal account, never on
 * an office user.
 *
 * ── The kinds are the asks, not a filing cabinet ─────────────────────────
 *
 * A document is worth recording because it takes something off somebody's
 * list - "the reference is in", "we have their ID". A free-text label would
 * make every upload land as "other" and the list would say nothing. So the
 * kinds are the things a tenant is actually asked for, and "Something else"
 * exists for the rest rather than as the default.
 */

/* The words and the row shape live in lib/tenant-documents-kinds, which is NOT
   server-only, so the tenant's own page can draw the dropdown. Imported for use
   here and re-exported, so nothing importing them from this module changes. */
import {
  TENANT_DOC_KINDS,
  isTenantDocKind,
  tenantDocLabel,
  type TenantDocKind,
  type TenantDocument,
} from "@/lib/tenant-documents-kinds";
export { TENANT_DOC_KINDS, isTenantDocKind, tenantDocLabel };
export type { TenantDocKind, TenantDocument };

type Row = {
  id: string;
  deal_id: string | null;
  kind: string;
  name: string;
  r2_key: string;
  bytes: number | null;
  content_type: string;
  uploaded_at: string | Date;
};

const shape = (r: Row): TenantDocument => ({
  id: r.id,
  dealId: r.deal_id,
  kind: r.kind,
  name: r.name,
  r2Key: r.r2_key,
  bytes: r.bytes,
  contentType: r.content_type,
  uploadedAt: new Date(r.uploaded_at).toISOString(),
});

const COLS = "id, deal_id, kind, name, r2_key, bytes, content_type, uploaded_at";

/** Everything one tenant has sent, newest first. */
export async function tenantDocuments(accountId: string): Promise<TenantDocument[]> {
  if (!hasDb()) return [];
  const rows = await q<Row>(
    `SELECT ${COLS} FROM os_tenant_documents WHERE account_id = $1 ORDER BY uploaded_at DESC`,
    [accountId]
  ).catch(() => [] as Row[]);
  return rows.map(shape);
}

/**
 * One document, ONLY if it belongs to that account.
 *
 * The account id is part of the query rather than checked after it. A lookup
 * by id alone, filtered afterwards, is one forgotten `if` away from handing a
 * tenant somebody else's passport scan.
 */
export async function tenantDocument(accountId: string, id: string): Promise<TenantDocument | null> {
  if (!hasDb()) return null;
  const rows = await q<Row>(
    `SELECT ${COLS} FROM os_tenant_documents WHERE account_id = $1 AND id = $2`,
    [accountId, id]
  ).catch(() => [] as Row[]);
  return rows[0] ? shape(rows[0]) : null;
}

export async function recordTenantDocument(d: {
  accountId: string;
  dealId: string | null;
  kind: TenantDocKind;
  name: string;
  r2Key: string;
  bytes: number;
  contentType: string;
}): Promise<TenantDocument> {
  const rows = await q<Row>(
    `INSERT INTO os_tenant_documents (id, account_id, deal_id, kind, name, r2_key, bytes, content_type)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING ${COLS}`,
    [crypto.randomBytes(12).toString("hex"), d.accountId, d.dealId, d.kind, d.name, d.r2Key, d.bytes, d.contentType]
  );
  return shape(rows[0]);
}

/**
 * Everything one tenant has sent, whatever it was sent against, for the
 * agent's side (23 Oct 2026). Read by email because the agent knows the
 * tenant by their lead and passport, not their portal account.
 *
 * documentsForDeal alone missed almost all of it: on 23 Oct every one of the
 * 24 files tenants had sent was out of sight. 17 went in before there was a
 * deal (Oluwabusayo Okeleye's ID, share code and bank statements for 6 Ruskin
 * Place; Joel Bowen's reference and payslips for 74 Anlaby Park Road North),
 * and 7 were on a sitting tenant's home, which no deal screen reads.
 */
export async function documentsForEmail(email: string): Promise<TenantDocument[]> {
  const e = email.trim().toLowerCase();
  if (!hasDb() || !e) return [];
  const rows = await q<Row>(
    `SELECT d.${COLS.split(", ").join(", d.")}
       FROM os_tenant_documents d
       JOIN os_portal_accounts a ON a.id = d.account_id AND a.kind = 'tenant'
      WHERE LOWER(a.email) = $1
      ORDER BY d.uploaded_at DESC`,
    [e]
  ).catch(() => [] as Row[]);
  return rows.map(shape);
}

/**
 * Files tenants sent in the last `days`, one row per tenant, for the bell of
 * the agent who sent them their passport (23 Oct 2026). A file arriving is a
 * thing to act on, and nobody was told.
 */
export async function recentTenantSends(agentId: string, days = 7): Promise<{ email: string; name: string; files: number; last: string; leadId: string | null }[]> {
  if (!hasDb() || !agentId) return [];
  const rows = await q<{ email: string; name: string | null; files: string; last: Date; lead_id: string | null }>(
    `SELECT t.email, t.name, t.files, t.last,
            (SELECT l.id FROM os_leads l WHERE LOWER(l.email) = t.email ORDER BY l.received_at DESC NULLS LAST LIMIT 1) AS lead_id
       FROM (SELECT LOWER(a.email) AS email, MAX(COALESCE(NULLIF(a.name, ''), p.name)) AS name,
                    COUNT(DISTINCT d.id)::text AS files, MAX(d.uploaded_at) AS last
               FROM os_tenant_documents d
               JOIN os_portal_accounts a ON a.id = d.account_id AND a.kind = 'tenant'
               JOIN os_tenant_passports p ON LOWER(p.email) = LOWER(a.email) AND p.agent_id = $1
              WHERE d.uploaded_at > NOW() - make_interval(days => $2)
              GROUP BY LOWER(a.email)) t
      ORDER BY t.last DESC LIMIT 20`,
    [agentId, days]
  ).catch(() => []);
  return rows.map((r) => ({ email: r.email, name: r.name || r.email, files: Number(r.files) || 0, last: new Date(r.last).toISOString(), leadId: r.lead_id }));
}

/** What one deal's tenants have sent, for the agent's side of the file. */
export async function documentsForDeal(dealId: string): Promise<(TenantDocument & { who: string })[]> {
  if (!hasDb() || !dealId) return [];
  const rows = await q<Row & { who: string }>(
    `SELECT d.${COLS.split(", ").join(", d.")}, COALESCE(a.name, a.email, '') AS who
       FROM os_tenant_documents d
       JOIN os_portal_accounts a ON a.id = d.account_id
      WHERE d.deal_id = $1
      ORDER BY d.uploaded_at DESC`,
    [dealId]
  ).catch(() => [] as (Row & { who: string })[]);
  return rows.map((r) => ({ ...shape(r), who: r.who }));
}
