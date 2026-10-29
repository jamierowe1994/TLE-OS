import "server-only";
import { hasDb, q } from "@/lib/db";
import { sameHome } from "@/lib/address-parse";
import { getAllPropolyDeals, getPropolyCompletes } from "@/lib/business/propoly-deals";

/**
 * A LET WITHDRAWN IN PROPOLY, as the OS learns of it (James, 29 Oct 2026: "if
 * a property gets withdrawn on Propoly, then that would then need to affect
 * the OS").
 *
 * Propoly's API has no withdrawn list: a withdrawn deal simply stops being
 * returned (and its cancelled list came back empty on 29 Oct). The deal
 * watcher (lib/business/deal-watch) already notices a deal leaving the live
 * book, asks Propoly what became of it, and writes the answer to
 * os_deal_states: "complete", "cancelled", or "gone" when Propoly no longer
 * has it at all. Those last two are a let that fell through.
 *
 * A home only counts as fallen through when nothing has replaced the deal: no
 * live deal on the same home now (a re-let keyed afresh - 6 Tenbury Crescent
 * had three go and a fourth running), and no move-in on it since (17/7 Upper
 * Grove Place's old deal was cancelled, its new one completed 1 Oct).
 */

export interface GoneDeal {
  dealId: string;
  property: string;
  status: "gone" | "cancelled";
  /** When the watcher saw it go, ISO. */
  at: string;
}

/* Three months is long enough for any agent to act on, short enough that a
   home relet since by hand isn't told its old deal fell through. */
const WINDOW_DAYS = 90;

/** Every deal that left Propoly without completing, newest first. Test files left out. */
export async function goneDeals(): Promise<GoneDeal[]> {
  if (!hasDb()) return [];
  const rows = await q<{ deal_id: string; property: string; status_key: "gone" | "cancelled"; seen_at: Date }>(
    `SELECT deal_id, property, status_key, seen_at FROM os_deal_states
      WHERE status_key IN ('gone', 'cancelled') AND seen_at > NOW() - make_interval(days => $1)
        AND property NOT ILIKE '%TLE OS TEST%'
      ORDER BY seen_at DESC`,
    [WINDOW_DAYS]
  ).catch(() => []);
  return rows.map((r) => ({ dealId: r.deal_id, property: r.property, status: r.status_key, at: new Date(r.seen_at).toISOString() }));
}

/**
 * The deal that fell through on this home, if one did and nothing has taken
 * its place. Null when Propoly can't be read: no answer is never "withdrawn".
 */
export async function fellThroughOnHome(address: string): Promise<GoneDeal | null> {
  if (!address.trim()) return null;
  const gone = (await goneDeals()).filter((g) => sameHome(address, g.property));
  if (!gone.length) return null;
  const [live, completes] = await Promise.all([getAllPropolyDeals().catch(() => null), getPropolyCompletes().catch(() => null)]);
  if (!live || !completes) return null;
  if (live.some((d) => d.statusKey !== "cancelled" && sameHome(address, `${d.app.propertyName}, ${d.app.locality}`))) return null;
  const latest = gone[0];
  const since = new Date(new Date(latest.at).getTime() - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
  if (completes.some((c) => c.address && sameHome(address, c.address) && (c.date ?? "") >= since)) return null;
  return latest;
}

/** The ids of deals that fell through, for the lets they belonged to. */
export async function goneDealIds(): Promise<Set<string>> {
  return new Set((await goneDeals()).map((g) => g.dealId));
}

/**
 * The homes with a deal going in Propoly now, for a let whose own deal went:
 * re-keyed under a new deal is not withdrawn. Null when Propoly can't be read.
 */
export async function homesWithLiveDeals(): Promise<string[] | null> {
  const live = await getAllPropolyDeals().catch(() => null);
  if (!live) return null;
  return live.filter((d) => d.statusKey !== "cancelled").map((d) => `${d.app.propertyName}, ${d.app.locality}`);
}
