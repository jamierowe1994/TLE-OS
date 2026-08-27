import "server-only";
import { rexCall } from "@/lib/rex";

/**
 * One agent's whole book, pulled by their REX user id.
 *
 * ── The join key, measured rather than guessed ────────────────────────────
 *
 * `system_owner_user_id` is the field that works, and it works on Listings,
 * Properties and Contacts. Verified 27 Aug against real ids: Rhiannon Dodge
 * (57533) → 83 listings, 85 properties, 1,583 contacts. Susan (53004) → 0
 * listings, which is right: she runs the business, she does not carry stock.
 *
 * Two dead ends recorded so nobody spends the afternoon on them again:
 *   · `listing_agent_id` is NOT searchable. REX returns "the field
 *     'listing_agent_id' is not searchable" — it exists for display only.
 *   · Leads do NOT accept `system_owner_user_id` at all. They use
 *     **`lead.assignee_id`**, which is a different question (who is chasing
 *     it) and the right one.
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
  listings: Counted;
  properties: Counted;
  contacts: Counted;
  leads: Counted;
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

export async function agentBook(rexId: string): Promise<AgentBook> {
  const [listings, properties, contacts, leads, rows] = await Promise.all([
    count("Listings", "system_owner_user_id", rexId),
    count("Properties", "system_owner_user_id", rexId),
    count("Contacts", "system_owner_user_id", rexId),
    // Leads are ASSIGNED, not owned — a different question, and the right one.
    count("Leads", "lead.assignee_id", rexId),
    recentListings(rexId),
  ]);
  return {
    rexId,
    listings,
    properties,
    contacts,
    leads,
    recentListings: rows,
    pulledAt: new Date().toISOString(),
  };
}
