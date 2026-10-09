import "server-only";
import { hasDb, q } from "@/lib/db";
import { owedFromBook, rentBook } from "@/lib/rent-status";
import type { ManagedProperty } from "@/lib/portfolio-types";

/**
 * The tenancy archive (James, 9 Oct 2026).
 *
 * "We need to make sure that we're logging all of that information in the
 * archives. Although it's not on the front listing, if we ever need to find
 * out if a tenant has done a run of a load of money, just because the
 * property disappears doesn't mean we can lose the information."
 *
 * Every let the managed book shows is written here each time the book is
 * read from REX: the whole row as Portfolio drew it, plus what the sitting
 * tenants owed at the last PayProp read. The row outlives the home leaving
 * Portfolio - last_seen simply stops moving - so the tenants, the rent, the
 * landlord and the last known debt can always be looked up.
 *
 * The debt is only ever overwritten by a newer, certain figure. A read that
 * can't match the home, or one too old to trust, leaves the last one alone,
 * so the figure from the week they left survives them leaving.
 */

export interface ArchivedTenancy {
  listingId: string;
  propertyId: string | null;
  name: string;
  locality: string;
  tenants: string;
  landlord: string;
  agentId: string | null;
  agentName: string;
  rentMonthly: number | null;
  letSince: string | null;
  owed: number | null;
  owedTenants: Array<{ name: string; owed: number; lastPayment: string | null }> | null;
  owedCheckedAt: string | null;
  firstSeen: string;
  lastSeen: string;
  /** Not on the book now: REX no longer shows this let. Set by the caller,
   *  who holds the book - the archive alone can't tell (it is only written
   *  when somebody reads Portfolio). */
  gone: boolean;
}

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v));
const num = (v: unknown) => (v == null || v === "" ? null : Number(v));
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const ymd = (v: unknown) => (v ? new Date(v as string).toISOString().slice(0, 10) : null);

function toArchived(r: Row): ArchivedTenancy {
  return {
    listingId: s(r.listing_id),
    propertyId: r.property_id ? s(r.property_id) : null,
    name: s(r.name),
    locality: s(r.locality),
    tenants: s(r.tenants),
    landlord: s(r.landlord),
    agentId: r.agent_id ? s(r.agent_id) : null,
    agentName: s(r.agent_name),
    rentMonthly: num(r.rent_monthly),
    letSince: ymd(r.let_since),
    owed: num(r.owed),
    owedTenants: Array.isArray(r.owed_tenants) ? (r.owed_tenants as ArchivedTenancy["owedTenants"]) : null,
    owedCheckedAt: iso(r.owed_checked_at),
    firstSeen: iso(r.first_seen)!,
    lastSeen: iso(r.last_seen)!,
    gone: false,
  };
}

const COLS = `listing_id, property_id, name, locality, tenants, landlord, agent_id, agent_name, rent_monthly, let_since,
  owed, owed_tenants, owed_checked_at, first_seen, last_seen`;

/**
 * Write the book into the archive. Called after every fresh read of the
 * book from REX (lib/managed-book-cache); never throws, because the archive
 * must not be the reason Portfolio fails to load.
 */
export async function archiveBook(properties: ManagedProperty[]): Promise<void> {
  if (!hasDb()) return;
  const rows = properties.filter((p) => !p.test && !p.held && p.listingId);
  if (!rows.length) return;
  const rents = await rentBook().catch(() => null);
  const payload = rows.map((p) => {
    const debt = owedFromBook(rents, { name: p.name, address: p.address, postcode: p.postcode });
    return {
      listing_id: p.listingId,
      property_id: p.propertyId,
      name: p.name,
      locality: p.locality,
      tenants: p.tenants.map((t) => t.name).filter(Boolean).join(" & "),
      landlord: p.landlord?.name ?? "",
      agent_id: p.agent?.id ?? null,
      agent_name: p.agent?.name ?? "",
      rent_monthly: p.rentMonthly,
      let_since: p.letSince ? p.letSince.slice(0, 10) : null,
      snapshot: { ...p, notice: undefined, held: undefined },
      owed: debt?.owed ?? null,
      owed_tenants: debt?.tenants ?? null,
      owed_checked_at: debt?.checkedAt ?? null,
    };
  });
  try {
    /* One statement for the whole book: a few hundred rows as one JSON array. */
    await q(
      `INSERT INTO os_tenancy_archive
         (listing_id, property_id, name, locality, tenants, landlord, agent_id, agent_name, rent_monthly, let_since, snapshot,
          owed, owed_tenants, owed_checked_at, first_seen, last_seen)
       SELECT r.listing_id, r.property_id, r.name, r.locality, r.tenants, r.landlord, r.agent_id, r.agent_name, r.rent_monthly, r.let_since, r.snapshot,
              r.owed, r.owed_tenants, r.owed_checked_at, NOW(), NOW()
         FROM jsonb_to_recordset($1::jsonb) AS r(
           listing_id TEXT, property_id TEXT, name TEXT, locality TEXT, tenants TEXT, landlord TEXT, agent_id TEXT, agent_name TEXT,
           rent_monthly NUMERIC, let_since DATE, snapshot JSONB, owed NUMERIC, owed_tenants JSONB, owed_checked_at TIMESTAMPTZ)
       ON CONFLICT (listing_id) DO UPDATE SET
         property_id = EXCLUDED.property_id, name = EXCLUDED.name, locality = EXCLUDED.locality,
         /* A let REX later shows with nobody named keeps the names it had. */
         tenants = CASE WHEN EXCLUDED.tenants <> '' THEN EXCLUDED.tenants ELSE os_tenancy_archive.tenants END,
         landlord = CASE WHEN EXCLUDED.landlord <> '' THEN EXCLUDED.landlord ELSE os_tenancy_archive.landlord END,
         agent_id = EXCLUDED.agent_id, agent_name = EXCLUDED.agent_name,
         rent_monthly = COALESCE(EXCLUDED.rent_monthly, os_tenancy_archive.rent_monthly),
         let_since = COALESCE(EXCLUDED.let_since, os_tenancy_archive.let_since),
         snapshot = EXCLUDED.snapshot,
         owed = COALESCE(EXCLUDED.owed, os_tenancy_archive.owed),
         owed_tenants = COALESCE(EXCLUDED.owed_tenants, os_tenancy_archive.owed_tenants),
         owed_checked_at = COALESCE(EXCLUDED.owed_checked_at, os_tenancy_archive.owed_checked_at),
         last_seen = NOW()`,
      [JSON.stringify(payload)]
    );
  } catch {
    /* Next read tries again. */
  }
}

/** The newest archived let for each of these homes, as Portfolio last drew it. */
export async function latestSnapshots(propertyIds: string[]): Promise<Map<string, ManagedProperty>> {
  const out = new Map<string, ManagedProperty>();
  if (!hasDb() || !propertyIds.length) return out;
  const rows = await q<{ property_id: string; snapshot: ManagedProperty }>(
    `SELECT DISTINCT ON (property_id) property_id, snapshot FROM os_tenancy_archive
      WHERE property_id = ANY($1::text[])
      ORDER BY property_id, let_since DESC NULLS LAST, last_seen DESC`,
    [propertyIds]
  ).catch(() => []);
  for (const r of rows) out.set(r.property_id, r.snapshot);
  return out;
}

/**
 * The archive, for looking someone up: by home, or by a search across the
 * address, tenants and landlord. An agent's view is their own lets only.
 */
export async function listArchive(opts: { propertyId?: string | null; search?: string; agentId?: string | null; notIn?: string[] | null; limit?: number }): Promise<ArchivedTenancy[]> {
  if (!hasDb()) return [];
  const where: string[] = [];
  const args: unknown[] = [];
  if (opts.propertyId) { args.push(opts.propertyId); where.push(`property_id = $${args.length}`); }
  if (opts.agentId) { args.push(opts.agentId); where.push(`agent_id = $${args.length}`); }
  const needle = (opts.search ?? "").trim().toLowerCase();
  if (needle) {
    args.push(`%${needle.replace(/[%_\\]/g, (m) => `\\${m}`)}%`);
    where.push(`lower(name || ' ' || locality || ' ' || tenants || ' ' || landlord) LIKE $${args.length}`);
  }
  /* "Left the book": every let except those on the book now. */
  if (opts.notIn?.length) { args.push(opts.notIn); where.push(`NOT (listing_id = ANY($${args.length}::text[]))`); }
  args.push(Math.min(Math.max(opts.limit ?? 200, 1), 500));
  const rows = await q<Row>(
    `SELECT ${COLS} FROM os_tenancy_archive ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY last_seen DESC, let_since DESC NULLS LAST LIMIT $${args.length}`,
    args
  );
  return rows.map(toArchived);
}
