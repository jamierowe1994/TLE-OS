import "server-only";
import { isExpiredToken, rexCall, rexConfigured, rexWritesLocked } from "@/lib/rex";
import { rexTokenFor } from "@/lib/rex-user";

/**
 * ADD A NEW LISTING, from the OS (16 Sep 2026).
 *
 * The last gap in the chain: a property could be created (lib/rex-properties)
 * and a listing could be edited, published and taken off the portals, but the
 * listing itself still had to be made in REX - "+ Add new listing" opened
 * their website in a new tab.
 *
 * ── The payload is COPIED, not guessed ────────────────────────────────────
 *
 * Read off 4 Williams Court (listing 843312) on 16 Sep 2026, the relet the OS
 * published the day before:
 *
 *   listing_category      { id: "residential_rental" }
 *   location              { id: "728", text: "The Letting Experts" }  ← the office
 *   listing_agent_1       { id: "<their REX user id>" }
 *   price_rent, price_advertise_as "£875", price_rent_period { id: "month" },
 *   price_rent_tax        { id: "tax_free" }, price_bond (the deposit)
 *   available_from_date   "2026-11-02"
 *   let_type              { id: "long_term" }   (listing_let_type)
 *   lettings_service_type { id: "managed" }     (managed | rent_collect | let_only)
 *   related.listing_subcategories [{ priority: 1, subcategory: { id: "475" } }]
 *                          ids from listing_subcat_residential_rental
 *
 * The subcategory matters beyond tidiness: without one the portal feeds refuse
 * the listing outright (measured across 100 rentals, 15 Sep).
 *
 * ── Gates ─────────────────────────────────────────────────────────────────
 *
 * Listings/create on the write allowlist, and the person's own REX sign-in -
 * never the office account, or every listing an agent adds is recorded as
 * somebody else forever. The switch is checked by the route.
 */

export interface NewListing {
  propertyId: string;
  /** Account-specific id from listing_subcat_residential_rental. */
  subcategoryId: string;
  rent: number;
  deposit?: number | null;
  availableFrom?: string | null;
  letType?: string;
  serviceLevel?: string;
  /** The office the listing belongs to; the only one TLE uses. */
  locationId?: string;
}

export type NewListingOutcome =
  | { ok: true; listingId: string }
  | { ok: false; reason: string; detail: string; payload?: Record<string, unknown> };

const TLE_OFFICE_ID = process.env.REX_LOCATION_ID ?? "728";

export function buildListingPayload(l: NewListing, agentRexId: string): Record<string, unknown> {
  const today = new Date().toISOString().slice(0, 10);
  return {
    listing_category: { id: "residential_rental" },
    property: { id: String(l.propertyId) },
    location: { id: l.locationId ?? TLE_OFFICE_ID },
    listing_agent_1: { id: String(agentRexId) },
    price_rent: l.rent,
    price_advertise_as: `£${l.rent.toLocaleString("en-GB")}`,
    price_rent_period: { id: "month" },
    price_rent_tax: { id: "tax_free" },
    ...(l.deposit != null ? { price_bond: l.deposit } : {}),
    ...(l.availableFrom ? { available_from_date: l.availableFrom } : {}),
    let_type: { id: l.letType ?? "long_term" },
    lettings_service_type: { id: l.serviceLevel ?? "managed" },
    authority_date_start: today,
    related: {
      listing_subcategories: [{ priority: 1, subcategory: { id: String(l.subcategoryId) } }],
    },
  };
}

/** The types a rental listing can be, from REX's own list. Read-only. */
export async function listingSubcategories(): Promise<{ id: string; label: string }[]> {
  const res = await rexCall("SystemValues", "getCategoryValues", { list_name: "listing_subcat_residential_rental" });
  const rows = Array.isArray(res.result) ? (res.result as { id?: unknown; text?: unknown }[]) : [];
  return rows
    .map((r) => ({ id: String(r.id ?? ""), label: String(r.text ?? "") }))
    .filter((r) => r.id && r.label)
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Addresses REX already holds, so a second record is never made by accident. */
export async function findAddresses(query: string): Promise<{ id: string; address: string }[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const res = await rexCall("Properties", "autocomplete", { search_string: q, limit: 8 });
  const rows = Array.isArray(res.result) ? (res.result as { id?: unknown; address?: unknown }[]) : [];
  return rows.map((r) => ({ id: String(r.id ?? ""), address: String(r.address ?? "") })).filter((r) => r.id && r.address);
}

export async function createListing(l: NewListing, userId: string | null, dryRun = false): Promise<NewListingOutcome> {
  if (!rexConfigured()) return { ok: false, reason: "not_configured", detail: "The listings system is not connected on this environment." };
  if (!l.propertyId) return { ok: false, reason: "incomplete", detail: "Pick the address first." };
  if (!l.subcategoryId) return { ok: false, reason: "incomplete", detail: "Choose what kind of property it is - the portals refuse a listing without it." };
  if (!(l.rent > 0)) return { ok: false, reason: "incomplete", detail: "A rent is needed before a listing can exist." };

  const token = await rexTokenFor(userId).catch(() => null);
  const agentRexId = token ? await rexUserIdFor(userId) : null;
  if (!token || !agentRexId) {
    return {
      ok: false,
      reason: "no_rex_session",
      detail: "Connect your REX account on your Profile first, so the listing is recorded as yours rather than the office's.",
    };
  }

  const payload = buildListingPayload(l, agentRexId);
  if (dryRun) return { ok: false, reason: "dry_run", detail: "Nothing was created.", payload };
  if (rexWritesLocked("Listings", "create")) {
    return { ok: false, reason: "writes_locked", detail: "Adding a listing is not switched on yet.", payload };
  }

  const res = await rexCall("Listings", "create", { data: payload, return_id: true }, token);
  if (isExpiredToken(res)) {
    return { ok: false, reason: "rex_session_expired", detail: "Your REX sign-in has lapsed. Connect it again on your Profile and try once more." };
  }
  if (!res.ok) return { ok: false, reason: "refused", detail: res.error ?? `The listing was refused (${res.status}).`, payload };

  const id = idFrom(res.result);
  if (!id) return { ok: false, reason: "no_id", detail: "It was created but no id came back, so it cannot be opened here. Find it in the book.", payload };
  return { ok: true, listingId: id };
}

function idFrom(result: unknown): string | null {
  if (typeof result === "number" || typeof result === "string") return String(result);
  const o = result as { id?: unknown } | null;
  return o?.id != null ? String(o.id) : null;
}

/**
 * Their REX user id, which the listing is filed under as the agent.
 *
 * Held on the account, looked up and stored the first time (ensureRexLink).
 * James had a live REX sign-in and no id on his row - the two are stored
 * separately - so a first attempt at adding a listing told him to connect an
 * account he had already connected (16 Sep 2026). The last resort is the
 * email REX itself gave us when he signed in, which is the one that matches
 * their user record when it differs from the OS one.
 */
async function rexUserIdFor(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const { findUserById, ensureRexLink, linkRexUser } = await import("@/lib/users");
  const user = await findUserById(userId).catch(() => null);
  if (!user) return null;
  const known = await ensureRexLink(user).catch(() => null);
  if (known) return String(known);

  const { rexSessionFor } = await import("@/lib/rex-user");
  const session = await rexSessionFor(userId).catch(() => null);
  if (!session?.email) return null;
  const { agentByEmail } = await import("@/lib/rex-agents");
  const agent = await agentByEmail(session.email).catch(() => null);
  if (!agent?.id) return null;
  await linkRexUser(user.id, agent.id).catch(() => {});
  return String(agent.id);
}
