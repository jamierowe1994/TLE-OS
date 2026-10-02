import "server-only";
import { hasDb, q } from "@/lib/db";
import { propertyKey } from "@/lib/business/payprop-portfolio";
import type { DealFlatbond } from "@/lib/business/stage-evidence";

export type { DealFlatbond };

/**
 * Flatfair, between the stages (James, 2 Oct 2026).
 *
 * Every TLE deposit goes through Flatfair: a traditional deposit it registers
 * with TDS, or a Flatfair no-deposit plan. A flatbond moves created ->
 * pending_tenant_action -> active, which is exactly the Deposit stop on the
 * spine. So the Deposit stage reads it.
 *
 * Read from OUR copy (os_flatbonds, kept by lib/flatfair-sync on a cron),
 * never from Flatfair on a page view: one sync lists the whole book in a
 * handful of calls, and nothing a screen does adds to it.
 *
 * ── Matching a flatbond to a deal ─────────────────────────────────────────
 *
 * Flatfair does not know Propoly's deal id. A tenant's email on both is the
 * strong join; failing that, the same door (number + street) in the same
 * postcode, with a start date near the move-in. Cancelled and closed
 * flatbonds are ignored: a cancelled one is a mistake undone, a closed one is
 * a tenancy that has ended.
 */

type Row = {
  id: number;
  status: string;
  product_type: string | null;
  address: string | null;
  postcode: string | null;
  start_date: Date | string | null;
  deposit_provider: string | null;
  registration_number: string | null;
  tenant_emails: string[] | null;
  tenants: Array<{ has_paid?: boolean }> | null;
};

const KEEP_MS = 5 * 60_000;
let held: { at: number; rows: Row[] } | null = null;

/** The live flatbonds still in play, kept for five minutes per process. */
export async function loadFlatbonds(): Promise<Row[]> {
  if (!hasDb()) return [];
  if (held && Date.now() - held.at < KEEP_MS) return held.rows;
  const rows = await q<Row>(
    `SELECT id, status, product_type, address, postcode, start_date, deposit_provider,
            registration_number, tenant_emails, raw->'tenants' AS tenants
       FROM os_flatbonds
      WHERE env = 'live' AND status NOT IN ('canceled', 'cancelled', 'closed')`
  ).catch(() => null);
  if (!rows) return held?.rows ?? [];
  held = { at: Date.now(), rows };
  return rows;
}

const iso = (d: Date | string | null) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const days = (a: string, b: string) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86_400_000;
const pc = (s: string | null | undefined) => (s ?? "").toUpperCase().replace(/\s+/g, "");

function shape(r: Row): DealFlatbond {
  const product = r.product_type ?? "unselected";
  const tenants = Array.isArray(r.tenants) ? r.tenants : [];
  const reg = r.registration_number?.trim() || null;
  return {
    id: r.id,
    status: r.status,
    product,
    provider: r.deposit_provider,
    registrationNumber: reg,
    startDate: iso(r.start_date),
    tenants: tenants.length || (r.tenant_emails?.length ?? 0),
    tenantsPaid: tenants.filter((t) => t?.has_paid === true).length,
    /* Active is the end of Flatfair's own flow. A traditional deposit also
       needs its scheme number before it counts as registered. */
    done: r.status === "active" && (product === "flatbond" || (product === "traditional_deposit" && Boolean(reg))),
  };
}

export function flatbondForDeal(
  deal: { app: { propertyName: string; locality?: string | null; startDate: string | null; tenants?: Array<{ email?: string | null }> } },
  rows: Row[]
): DealFlatbond | null {
  const emails = new Set(
    (deal.app.tenants ?? []).map((t) => (t.email ?? "").trim().toLowerCase()).filter(Boolean)
  );
  const key = propertyKey(deal.app.propertyName);
  const postcode = pc((deal.app.locality ?? "").match(/[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/i)?.[0]);
  const move = deal.app.startDate;

  const near = (r: Row) => {
    const s = iso(r.start_date);
    return !move || !s || days(move, s) <= 60;
  };
  const byEmail = rows.filter((r) => (r.tenant_emails ?? []).some((e) => emails.has(e.trim().toLowerCase())) && near(r));
  /* Rooms in one house share a door. Where either side names a room, both
     must name the same one, or Room 1 would take Room 2's deposit. */
  const room = (s: string | null | undefined) => (s ?? "").match(/\b(?:room|rm)\s*(\d+)/i)?.[1] ?? null;
  const myRoom = room(deal.app.propertyName);
  const byDoor = key
    ? rows.filter(
        (r) =>
          propertyKey(r.address ?? "") === key &&
          (!postcode || pc(r.postcode) === postcode) &&
          room(r.address) === myRoom &&
          near(r)
      )
    : [];
  const pool = byEmail.length ? byEmail : byDoor;
  if (!pool.length) return null;
  /* The newest start first: a tenant renewing has an older flatbond too. */
  const best = [...pool].sort((a, b) => String(iso(b.start_date)).localeCompare(String(iso(a.start_date))))[0];
  return shape(best);
}
