import "server-only";
import { hasDb, q } from "@/lib/db";
import { getAllPropolyDeals, type BusinessDeal } from "@/lib/business/propoly-deals";
import { propolyDealUrl } from "@/lib/business/propoly-stages";
import { sameHome } from "@/lib/address-parse";
import type { Application } from "@/lib/applications";

/**
 * A LET'S PROPOLY DEAL, read from the saved copy of the book (20 Oct 2026).
 *
 * The people on a let are compared with the people on its deal, and a
 * change goes across to that deal (lib/let-propoly-sync). So which deal is
 * the let's has to be sure, and found without asking Propoly anything: the
 * watcher is the one reader (lib/business/propoly-deals), this reads its copy.
 *
 * In order: the let IS the deal (opened by its uuid); the deal the OS's own
 * push started; the deal on the same listing; the deal on the same home by
 * address. A cancelled deal is never the let's. A change of tenants (swap)
 * always gets a new deal of its own, so only its pushed deal counts.
 */

export interface LetDeal {
  id: string;
  url: string;
  statusKey: string;
  status: string;
  propertyUuid: string | null;
  tenants: Array<{ name: string; email: string | null; phone: string | null }>;
  landlords: Array<{ uuid: string | null; name: string | null; email: string | null; phone: string | null }>;
  /** How the deal was found, in words for the let page. */
  how: string;
}

type Find = { ref: string; app: Application | null; propertyName: string; locality: string; listingId: string | null };

export async function dealForLet(f: Find): Promise<LetDeal | null> {
  const deals = await getAllPropolyDeals().catch(() => null);
  if (!deals?.length) return null;
  const live = deals.filter((d) => d.statusKey !== "cancelled");
  const byId = (id: string | null | undefined) => (id ? live.find((d) => d.app.id === id) ?? null : null);

  const own = byId(f.ref);
  if (own) return shape(own, "This let is the Propoly deal.");
  const pushed = byId(f.app?.propolyDealId ?? (f.app ? await pushedDeal(String(f.app.id)) : null));
  if (pushed) return shape(pushed, "Started by Push to Propoly.");
  if (f.app?.swap) return null;
  const listed = f.listingId ? live.find((d) => d.app.listingId != null && String(d.app.listingId) === f.listingId) : undefined;
  if (listed) return shape(listed, "On the same listing.");
  const here = `${f.propertyName}, ${f.locality}`;
  const sameAddress = live.filter((d) => sameHome(here, `${d.app.propertyName}, ${d.app.locality}`));
  /* Two live deals on one home (a re-let keyed early): the one moving in
     nearest the let's own move-in. */
  const start = f.app?.startDate ? Date.parse(f.app.startDate) : NaN;
  const best = sameAddress.sort((a, b) => gap(a, start) - gap(b, start))[0];
  return best ? shape(best, "On the same home.") : null;
}

function gap(d: BusinessDeal, start: number): number {
  const s = d.app.startDate ? Date.parse(d.app.startDate) : NaN;
  return Number.isFinite(s) && Number.isFinite(start) ? Math.abs(s - start) : Number.MAX_SAFE_INTEGER / 2;
}

function shape(d: BusinessDeal, how: string): LetDeal {
  const p = d.app.propoly;
  const landlords = p?.landlords?.length
    ? p.landlords
    : p?.landlord
      ? [{ uuid: p.landlordUuids?.[0] ?? null, ...p.landlord }]
      : [];
  return {
    id: d.app.id,
    url: propolyDealUrl(d.app.id),
    statusKey: d.statusKey,
    status: d.app.status,
    propertyUuid: p?.propertyUuid ?? null,
    tenants: d.app.tenants.map((t) => ({ name: t.name, email: t.email, phone: t.phone })),
    landlords,
    how,
  };
}

/** The deal step of the let's last good live push, if the OS pushed it. */
async function pushedDeal(applicationId: string): Promise<string | null> {
  if (!hasDb()) return null;
  const rows = await q<{ deal: string | null }>(
    `SELECT (SELECT s->'response'->>'uuid' FROM jsonb_array_elements(CASE WHEN jsonb_typeof(steps) = 'array' THEN steps ELSE '[]'::jsonb END) s
              WHERE s->>'id' = 'deal' AND s->>'state' = 'ok' LIMIT 1) AS deal
       FROM os_handovers WHERE application_id = $1 AND mode = 'live' AND status = 'ok'
      ORDER BY started_at DESC LIMIT 1`,
    [applicationId]
  ).catch(() => []);
  return rows[0]?.deal ?? null;
}
