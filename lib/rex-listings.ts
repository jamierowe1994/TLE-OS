import "server-only";
import { rexCall, rexConfigured, rexRows } from "@/lib/rex";

/**
 * The rental book, live from REX.
 *
 * Three things this file exists to get right:
 *
 * 1. RENTALS MUST BE ASKED FOR. Without an explicit category criterion the
 *    first pages come back entirely sales stock — this REX account is shared
 *    with a sales business.
 *
 * 2. SOME RENTS ARE WEEKLY. `price_rent_period` is month, week or null.
 *    Rendering £300 a week as "£300 pcm" understates a property by a factor
 *    of four and would put a wrong figure in front of a landlord, so the
 *    period travels with the number and the card prints what REX actually
 *    says.
 *
 * 3. HALF THE BOOK IS THIN. Only 64% carry a rent, 55% a photo, 57% an EPC
 *    expiry — mostly the 56% that are unpublished drafts. Missing values stay
 *    missing rather than being invented or defaulted to zero.
 *
 * `extra_fields` is NOT a top-level argument to Listings/search (that 400s);
 * it goes inside `extra_options`.
 */

const PAGE_SIZE = 100;
const MAX_PAGES = 8; // 800 rows — the book is ~294, so this is a runaway guard

export interface OsListing {
  id: string;
  name: string;
  locality: string;
  rent: number | null;
  /** "month" | "week" — never assume; see note 2 above. */
  rentPeriod: "month" | "week" | null;
  /** The same rent expressed monthly, for SORTING AND BANDING ONLY — never
   *  for display. Without it a £675-a-week flat sorts and filters as though
   *  it were £675 a month, i.e. into the cheapest band in the book. */
  rentMonthly: number | null;
  letAgreed: boolean;
  publicationStatus: "published" | "draft" | null;
  availableFrom: string | null;
  epcExpiry: string | null;
  epcRating: string | null;
  /** Days since it went live on the portals. Only the published half has a
   *  publication time, so this is null for drafts — which is the truth. */
  daysOnMarket: number | null;
  lastUpdated: string;
  imageCount: number;
  image: string | null;
  /** Managed / Let Only / Rent Collect — what we actually do for this landlord. */
  serviceType: string | null;
  tenant: string | null;
}

export interface ListingBook {
  listings: OsListing[];
  counts: {
    currentRentals: number;
    published: number;
    draft: number;
    letAgreed: number;
    available: number;
    withPhoto: number;
    withRent: number;
  };
  pulledAt: string;
}

interface RexAddress {
  system_search_key?: string;
  adr_unit_number?: string | null;
  adr_street_number?: string | null;
  adr_street_name?: string | null;
  adr_building?: string | null;
  adr_suburb_or_town?: string | null;
  adr_postcode?: string | null;
}

interface RexListing extends Record<string, unknown> {
  id?: number | string;
  system_publication_status?: string | null;
  system_publication_time?: number | string | null;
  system_modtime?: number | string | null;
  price_rent?: number | string | null;
  price_rent_period?: { id?: string } | null;
  let_agreed?: unknown;
  available_from_date?: string | null;
  epc_expiry_date?: string | null;
  epc_rating?: string | null;
  lettings_service_type?: { text?: string } | string | null;
  property?: RexAddress | null;
  listing_primary_image?: { url?: string } | null;
  related?: { listing_images?: { url?: string }[] } | null;
}

/** REX hands image URLs back protocol-relative — unusable outside a browser. */
function https(url: string | undefined | null): string | null {
  if (!url) return null;
  return url.startsWith("//") ? `https:${url}` : url;
}

function addressOf(p: RexAddress | null | undefined): { name: string; locality: string } {
  if (!p) return { name: "Address not recorded", locality: "—" };
  const street = [p.adr_street_number, p.adr_street_name].filter(Boolean).join(" ").trim();
  const name =
    [
      p.adr_unit_number ? `Apartment ${p.adr_unit_number}` : null,
      p.adr_building,
      street || null,
    ]
      .filter(Boolean)
      .join(", ") ||
    p.system_search_key ||
    "Address not recorded";
  const locality = [p.adr_suburb_or_town, p.adr_postcode].filter(Boolean).join(" ") || "—";
  return { name, locality };
}

function ago(secs: number | null): string {
  if (!secs) return "—";
  const days = Math.floor((Date.now() / 1000 - secs) / 86400);
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return months < 12 ? `${months}mo ago` : `${Math.round(months / 12)}y ago`;
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toListing(l: RexListing): OsListing {
  const { name, locality } = addressOf(l.property);
  const published = num(l.system_publication_time);
  const period = l.price_rent_period?.id;
  const service =
    typeof l.lettings_service_type === "string"
      ? l.lettings_service_type
      : (l.lettings_service_type?.text ?? null);

  return {
    id: String(l.id ?? ""),
    name,
    locality,
    rent: num(l.price_rent),
    rentPeriod: period === "week" ? "week" : period === "month" ? "month" : null,
    rentMonthly:
      num(l.price_rent) == null
        ? null
        : period === "week"
          ? Math.round((num(l.price_rent) as number) * 52 / 12)
          : num(l.price_rent),
    // REX writes this as null, "0" or "1" — "0" is a string and therefore
    // truthy, which is exactly how a quarter of the book gets mislabelled.
    letAgreed: l.let_agreed != null && l.let_agreed !== "0" && l.let_agreed !== 0 && l.let_agreed !== false,
    publicationStatus:
      l.system_publication_status === "published"
        ? "published"
        : l.system_publication_status === "draft"
          ? "draft"
          : null,
    availableFrom: l.available_from_date ?? null,
    epcExpiry: l.epc_expiry_date ?? null,
    epcRating: l.epc_rating ?? null,
    daysOnMarket: published ? Math.floor((Date.now() / 1000 - published) / 86400) : null,
    lastUpdated: ago(num(l.system_modtime)),
    imageCount: l.related?.listing_images?.length ?? (l.listing_primary_image ? 1 : 0),
    image: https(l.listing_primary_image?.url ?? l.related?.listing_images?.[0]?.url),
    serviceType: service,
    tenant: null, // tenancy_id is populated on 0% of the book — nothing to join to
  };
}

export async function fetchListingBook(): Promise<ListingBook> {
  if (!rexConfigured()) {
    return {
      listings: [],
      counts: { currentRentals: 0, published: 0, draft: 0, letAgreed: 0, available: 0, withPhoto: 0, withRent: 0 },
      pulledAt: new Date().toISOString(),
    };
  }

  const rows: RexListing[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await rexCall("Listings", "search", {
      criteria: [
        { name: "system_listing_state", value: "current" },
        // Without this the pages come back as sales stock — see note 1.
        { name: "listing_category_id", value: "residential_rental" },
      ],
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      order_by: { system_modtime: "desc" },
      extra_options: { extra_fields: ["related.listing_images"] },
    });
    if (!res.ok) break;
    const batch = rexRows(res.result) as RexListing[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }

  const listings = rows.map(toListing);
  return {
    listings,
    counts: {
      currentRentals: listings.length,
      published: listings.filter((l) => l.publicationStatus === "published").length,
      draft: listings.filter((l) => l.publicationStatus === "draft").length,
      letAgreed: listings.filter((l) => l.letAgreed).length,
      available: listings.filter((l) => !l.letAgreed).length,
      withPhoto: listings.filter((l) => l.image).length,
      withRent: listings.filter((l) => l.rent != null).length,
    },
    pulledAt: new Date().toISOString(),
  };
}
