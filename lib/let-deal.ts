import "server-only";
import { hasDb, q } from "@/lib/db";
import { getAllPropolyDeals, type BusinessDeal } from "@/lib/business/propoly-deals";
import { propolyDealUrl } from "@/lib/business/propoly-stages";
import { sameHome } from "@/lib/address-parse";
import type { Application } from "@/lib/applications";
import { letEditsFor, withOwnLetEdits } from "@/lib/let-edits";

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
  /**
   * The deal's move-in day, with a move-in put right in the OS already laid
   * over Propoly's (lib/let-edits) - on the let or on the deal, before the
   * let had its deal or after (4 Nov 2026, withLetsFigures below). Once a
   * let is in Propoly this is the day the agreement is drawn on, so the PLC
   * check opens on it (Lianna Denholm, 3 Nov 2026, lib/plc-prefill).
   */
  moveIn: string | null;
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
  if (pushed) return shape(await withLetsFigures(pushed, f), "Started by Push to Propoly.");
  if (f.app?.swap) return null;
  const listed = f.listingId ? live.find((d) => d.app.listingId != null && String(d.app.listingId) === f.listingId) : undefined;
  if (listed) return shape(await withLetsFigures(listed, f), "On the same listing.");
  const here = `${f.propertyName}, ${f.locality}`;
  const sameAddress = live.filter((d) => sameHome(here, `${d.app.propertyName}, ${d.app.locality}`));
  /* Two live deals on one home (a re-let keyed early): the one moving in
     nearest the let's own move-in. */
  const start = f.app?.startDate ? Date.parse(f.app.startDate) : NaN;
  const best = sameAddress.sort((a, b) => gap(a, start) - gap(b, start))[0];
  return best ? shape(await withLetsFigures(best, f), "On the same home.") : null;
}

/*
 * Lianna Denholm, 4 Nov 2026 (12 South Chesters Lane, application 40658):
 * she put the move-in at 10 November and the deposit at £1,542 on the let,
 * and the let showed them, but they were saved against the application alone
 * (no deal was found for the let at that moment), and the deal only reads
 * figures saved against it. So the PLC check, which opens on the deal's
 * move-in, still opened on Propoly's 9 November: "not saving". The deal
 * found here now carries the let's own figures too, newest winning field by
 * field, as the let page reads them (lib/let-edits withOwnLetEdits). A deal
 * the OS pushed for the let has them in the book already; one found by
 * listing or address gets them only here, for this let's own reading.
 */
async function withLetsFigures(d: BusinessDeal, f: Find): Promise<BusinessDeal> {
  if (!f.app) return d;
  const mine = (await letEditsFor([f.ref]).catch(() => null))?.get(f.ref);
  return withOwnLetEdits(d, mine);
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
    moveIn: d.app.startDate ? d.app.startDate.slice(0, 10) : null,
    how,
  };
}

/** The deal the OS made for the let: the newest live push whose deal step went,
 *  whether or not a later step failed (29 Oct 2026, see lib/applications pushedDeals). */
async function pushedDeal(applicationId: string): Promise<string | null> {
  return (await pushedDeals([applicationId])).get(applicationId) ?? null;
}

/**
 * The same for several lets at once, application id -> deal (4 Nov 2026):
 * the Propoly book reads a let's own figures onto the deal the OS pushed it
 * into (lib/let-edits), in one read rather than one per let.
 */
export async function pushedDeals(applicationIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(applicationIds.filter(Boolean))];
  if (!hasDb() || !ids.length) return new Map();
  const rows = await q<{ application_id: string; deal: string | null }>(
    `SELECT DISTINCT ON (application_id) application_id, deal FROM (
       SELECT application_id, started_at, (SELECT s->'response'->>'uuid' FROM jsonb_array_elements(CASE WHEN jsonb_typeof(steps) = 'array' THEN steps ELSE '[]'::jsonb END) s
                            WHERE s->>'id' = 'deal' AND s->>'state' = 'ok' LIMIT 1) AS deal
         FROM os_handovers WHERE application_id = ANY($1::text[]) AND mode = 'live'
     ) x WHERE deal IS NOT NULL ORDER BY application_id, started_at DESC`,
    [ids]
  ).catch(() => []);
  return new Map(rows.filter((r) => r.deal).map((r) => [r.application_id, r.deal as string]));
}
