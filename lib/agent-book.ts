import "server-only";
import { rexCall } from "@/lib/rex";

/**
 * One agent's whole book, pulled by their REX user id.
 *
 * ── The join keys, measured against real ids ──────────────────────────────
 *
 * Corrected 27 Aug after reading the F&C pipeline and the TLE portal, which
 * had already solved this. My first pass used `listing_agent_id` — not a
 * field — and then fell back to `system_owner_user_id` alone. Both were wrong
 * in different ways.
 *
 * Measured on Rhiannon Dodge (57533):
 *
 *   system_owner_user_id   83 listings   ← who the record BELONGS to
 *   listing_agent_1_id     76 listings   ← who is SELLING it
 *   listing_agent_2_id      0 listings
 *
 * They disagree by seven, and that is not an error to reconcile — they are
 * different questions. F&C counts a listing as an agent's if it matches ANY
 * of the three (`shapeListing`, searchRexListings/entry.ts:50-57), which is
 * the honest answer to "what is Rhiannon's book".
 *
 * Recorded so nobody loses an afternoon to them:
 *   · `listing_agent_id` (no digit) is NOT searchable — REX refuses it by name.
 *   · Leads reject `system_owner_user_id` entirely. They use
 *     **`lead.assignee_id`** — who is CHASING it, which is the better question.
 *   · Appraisals use `agent_1_id`, applications `application.agent_id`.
 *   · VIEWINGS CANNOT BE COUNTED PER AGENT AT ALL. They live on CalendarEvents,
 *     which carry no owning agent — the portal hit the same wall
 *     (lib/rex-stats.ts:436-439). Business-wide or nothing, so this page shows
 *     nothing rather than a wrong number.
 *
 * ── The lettings caveat, inherited from the portal ────────────────────────
 *
 * TLE partners also sell for The Property Experts on the SAME REX id — six
 * businesses share account 3517. So a raw count is "everything this person
 * touches", not "their lettings book". Where a figure is used commercially it
 * must narrow by its own means (rental category, `appraisal_type === "rent"`).
 * Stated on the page rather than silently fudged.
 *
 * ── Counts first, rows second ─────────────────────────────────────────────
 *
 * Every call asks for `limit: 1` and reads `total`. A person page that pulled
 * 1,856 leads to show a number would take fifteen seconds and then throw
 * nearly all of it away. Rows are fetched only for the short preview lists.
 *
 * ── Each pull fails on its own ────────────────────────────────────────────
 *
 * Settled, not all-or-nothing: one slow or refused class must not blank the
 * whole page. A section that could not load says so, rather than showing zero
 * — a zero here would read as "this agent has no properties", which is a very
 * different and much more alarming statement.
 */

export interface Counted {
  total: number | null;
  /** Null total means the pull failed — NOT that there is nothing. */
  failed: boolean;
}

export interface AgentBook {
  rexId: string;
  /** Owned OR sold by them — see the header on why both are counted. */
  listings: Counted;
  /** Live on the market right now. */
  onMarket: Counted;
  /** Let and being managed — the recurring half of the book. */
  managed: Counted;
  properties: Counted;
  contacts: Counted;
  leads: Counted;
  appraisals: Counted;
  applications: Counted;
  /** A handful of real rows, so the page shows work and not just arithmetic. */
  recentListings: Array<{ id: string; address: string; status: string | null; rent: number | null }>;
  pulledAt: string;
}

async function count(service: string, field: string, id: string): Promise<Counted> {
  try {
    const res = await rexCall(service, "search", {
      criteria: [{ name: field, type: "=", value: id }],
      limit: 1,
    });
    if (!res.ok) return { total: null, failed: true };
    const total = (res.result as { total?: number } | undefined)?.total;
    return typeof total === "number" ? { total, failed: false } : { total: null, failed: true };
  } catch {
    return { total: null, failed: true };
  }
}

interface RexListingRow {
  id?: string | number;
  system_search_key?: string;
  system_listing_state?: string;
  price_rent?: number;
  property?: { adr_street_number?: string; adr_street_name?: string; adr_suburb_or_town?: string };
}

async function recentListings(id: string): Promise<AgentBook["recentListings"]> {
  try {
    const res = await rexCall("Listings", "search", {
      criteria: [{ name: "system_owner_user_id", type: "=", value: id }],
      limit: 8,
      order_by: { system_ctime: "desc" },
    });
    if (!res.ok) return [];
    const rows = ((res.result as { rows?: RexListingRow[] } | undefined)?.rows ?? []) as RexListingRow[];
    return rows.map((r) => {
      const p = r.property ?? {};
      const address =
        [p.adr_street_number, p.adr_street_name].filter(Boolean).join(" ") ||
        r.system_search_key ||
        "Address not recorded";
      return {
        id: String(r.id ?? ""),
        address: p.adr_suburb_or_town ? `${address}, ${p.adr_suburb_or_town}` : address,
        status: r.system_listing_state ?? null,
        rent: typeof r.price_rent === "number" ? r.price_rent : null,
      };
    });
  } catch {
    return [];
  }
}

/** Two criteria at once — REX ANDs them. */
async function countWhere(service: string, criteria: Array<{ name: string; type: string; value: string }>): Promise<Counted> {
  try {
    const res = await rexCall(service, "search", { criteria, limit: 1 });
    if (!res.ok) return { total: null, failed: true };
    const total = (res.result as { total?: number } | undefined)?.total;
    return typeof total === "number" ? { total, failed: false } : { total: null, failed: true };
  } catch {
    return { total: null, failed: true };
  }
}

export async function agentBook(rexId: string): Promise<AgentBook> {
  const [owned, sold, onMarket, managed, properties, contacts, leads, appraisals, applications, rows] =
    await Promise.all([
      count("Listings", "system_owner_user_id", rexId),
      count("Listings", "listing_agent_1_id", rexId),
      countWhere("Listings", [
        { name: "listing_agent_1_id", type: "=", value: rexId },
        { name: "system_listing_state", type: "=", value: "current" },
      ]),
      countWhere("Listings", [
        { name: "listing_agent_1_id", type: "=", value: rexId },
        { name: "system_listing_state", type: "=", value: "leased" },
      ]),
      count("Properties", "system_owner_user_id", rexId),
      count("Contacts", "system_owner_user_id", rexId),
      count("Leads", "lead.assignee_id", rexId),
      count("Appraisals", "agent_1_id", rexId),
      count("TenancyApplications", "application.agent_id", rexId),
      recentListings(rexId),
    ]);

  /* The larger of the two, not the sum: a listing an agent both owns and sells
     would otherwise be counted twice. REX cannot express OR across fields in
     one search, and firing a third query to union the ids would cost more than
     the precision is worth on a page whose job is "roughly how big is this
     book". Stated here so the number is never mistaken for exact. */
  const listings: Counted =
    owned.failed && sold.failed
      ? { total: null, failed: true }
      : { total: Math.max(owned.total ?? 0, sold.total ?? 0), failed: false };

  return {
    rexId,
    listings,
    onMarket,
    managed,
    properties,
    contacts,
    leads,
    appraisals,
    applications,
    recentListings: rows,
    pulledAt: new Date().toISOString(),
  };
}
