import "server-only";
import { rexCall, rexConfigured, RexError, rexRows } from "@/lib/rex";

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
  /** REX hangs compliance certificates off the PROPERTY, not the listing. */
  propertyId: string | null;
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
  /** The day it went live, ISO date. Same source as daysOnMarket. */
  publishedAt: string | null;
  /**
   * The day the record was MADE in REX, ISO date.
   *
   * This is what a draft's age is measured from, and the choice matters.
   * `system_modtime` looks like the obvious liveness signal and is not: on
   * 14 Sep 2026, 71 of the 91 drafts "touched in the last 30 days" carried
   * the SAME modtime - 6 Sep - which is a bulk sync, not 71 people working.
   * One of them was created in February 2024. Ageing a draft by when it was
   * last written to would therefore keep a two-year-old shell in the working
   * list because a background job brushed past it.
   *
   * `system_ctime` is populated on all 167 current drafts (measured), never
   * moves, and answers the question actually being asked: how long has this
   * thing been sitting here unpublished.
   */
  createdAt: string | null;
  /** REX's own state - current / leased / withdrawn. The book is `current`;
   *  the archive also reads `withdrawn`, which is where a listing that came
   *  off the market without a tenant ends up. */
  listingState: string | null;
  /** The day it entered that state, ISO. For a withdrawn listing, the day it
   *  came off the market. */
  stateDate: string | null;
  lastUpdated: string;
  imageCount: number;
  image: string | null;
  /**
   * EVERY photo, in REX's own order.
   *
   * We were asking REX for these, counting them, and then keeping only the
   * first — which is why the OS looked like it could only see one photo per
   * property. It could always see them all: measured, live listings carry 29,
   * 29, 31 and 12. The ones showing none are the unpublished drafts, which is
   * more than half the book.
   */
  images: string[];
  /** Where it is, exactly. Populated on every current rental (9 Sep 2026),
   *  which is what makes a radius search around a tenant honest. */
  lat: number | null;
  lng: number | null;
  postcode: string | null;
  /**
   * House, flat, bungalow - REX's property subcategory.
   *
   * Populated on 168 of 266 current rentals, so the filter offers "any" and a
   * home with none is never hidden by a type filter it cannot answer. REX has
   * NO bedroom field at all - checked against the model - so there is no beds
   * filter to build from this source.
   */
  propertyType: string | null;
  /** Managed / Let Only / Rent Collect — what we actually do for this landlord. */
  serviceType: string | null;
  tenant: string | null;
  /**
   * The marketing write-up — the copy that goes to Rightmove.
   *
   * REX keeps it in `related.listing_adverts`, one row per advert_type; the
   * "internet" row is the portal one, and brochure/stocklist sit beside it
   * unused. Measured across the current book (11 Aug 2026): every one of the
   * 128 published rentals has one, and 128 of the 164 drafts have nothing —
   * so this is a pre-publication gap, not a live one.
   */
  advertHeading: string | null;
  advertBody: string | null;
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
    /** How much of the book is ready to go out: a portal advert with a body. */
    withWriteUp: number;
    /** The ones that would go to the portals with nothing to read. */
    draftsMissingWriteUp: number;
  };
  pulledAt: string;
}

interface RexAddress {
  system_search_key?: string;
  adr_unit_number?: string | null;
  adr_street_number?: string | null;
  adr_street_name?: string | null;
  /** An OBJECT, not a string — carries the building's name ("Dara House")
   *  plus its own address. Interpolating it raw prints "[object Object]". */
  adr_building?: { name?: string | null } | string | null;
  adr_suburb_or_town?: string | null;
  adr_postcode?: string | null;
  /* MEASURED 9 Sep 2026: latitude, longitude and postcode are populated on
     266 of 266 current rentals, so a radius search around a tenant's own
     address is exact rather than town-level. */
  adr_latitude?: string | number | null;
  adr_longitude?: string | number | null;
  property_subcategory?: { text?: string | null } | null;
}

export interface RexListing extends Record<string, unknown> {
  /** current / leased / withdrawn / archived — REX's own state. */
  system_listing_state?: string | null;
  id?: number | string;
  system_publication_status?: string | null;
  system_publication_time?: number | string | null;
  system_modtime?: number | string | null;
  /** Unix seconds, when the record was created. See OsListing.createdAt. */
  system_ctime?: number | string | null;
  /** ISO date, when it entered system_listing_state. */
  state_date?: string | null;
  price_rent?: number | string | null;
  price_rent_period?: { id?: string } | null;
  let_agreed?: unknown;
  available_from_date?: string | null;
  epc_expiry_date?: string | null;
  epc_rating?: string | null;
  lettings_service_type?: { text?: string } | string | null;
  property?: (RexAddress & { id?: string | number }) | null;
  listing_primary_image?: { url?: string } | null;
  related?: {
    listing_images?: {
      url?: string;
      /** 1..n, REX's own display order. */
      priority?: number;
      thumbs?: Record<string, { url?: string }>;
    }[];
    listing_adverts?: { advert_type?: string; advert_heading?: string | null; advert_body?: string | null }[];
  } | null;
}

/** REX hands image URLs back protocol-relative — unusable outside a browser. */
function https(url: string | undefined | null): string | null {
  if (!url) return null;
  return url.startsWith("//") ? `https:${url}` : url;
}

/**
 * Every photo on a listing, in REX's display order.
 *
 * The 800x600 thumbnail rather than the original, deliberately: originals are
 * 1200x667 and a listing carries thirty of them, so a drawer that loaded the
 * full set at full size would pull tens of megabytes to fill a panel a few
 * hundred pixels wide. The primary image is forced to the front in case REX
 * ever disagrees with its own priority ordering.
 */
function photos(l: RexListing): string[] {
  const rows = [...(l.related?.listing_images ?? [])].sort(
    (a, b) => (a.priority ?? 999) - (b.priority ?? 999)
  );
  const urls = rows
    .map((r) => https(r.thumbs?.["800x600"]?.url ?? r.url))
    .filter((u): u is string => Boolean(u));
  const primary = https(l.listing_primary_image?.url);
  if (primary && !urls.includes(primary)) urls.unshift(primary);
  return urls;
}

function addressOf(p: RexAddress | null | undefined): { name: string; locality: string } {
  if (!p) return { name: "Address not recorded", locality: "—" };
  const street = [p.adr_street_number, p.adr_street_name].filter(Boolean).join(" ").trim();
  const building =
    typeof p.adr_building === "string" ? p.adr_building : (p.adr_building?.name ?? null);
  const name =
    [
      p.adr_unit_number ? `Apartment ${p.adr_unit_number}` : null,
      building,
      street || null,
    ]
      .filter(Boolean)
      .join(", ") ||
    p.system_search_key ||
    "Address not recorded";
  const locality = [p.adr_suburb_or_town, p.adr_postcode].filter(Boolean).join(" ") || "—";
  return { name, locality };
}

/** Unix seconds as an ISO date, or null. */
function isoDay(secs: number | null): string | null {
  return secs ? new Date(secs * 1000).toISOString().slice(0, 10) : null;
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

/** The portal advert out of the three REX keeps. Blank strings count as
 *  missing — a few carry a heading with an empty body. */
function internetAdvert(l: RexListing): { heading: string | null; body: string | null } {
  const rows = l.related?.listing_adverts ?? [];
  const net = rows.find((a) => a?.advert_type === "internet");
  const trim = (v: unknown) => {
    const s = typeof v === "string" ? v.trim() : "";
    return s ? s : null;
  };
  return { heading: trim(net?.advert_heading), body: trim(net?.advert_body) };
}

export function toListing(l: RexListing): OsListing {
  const { name, locality } = addressOf(l.property);
  const advert = internetAdvert(l);
  const published = num(l.system_publication_time);
  const period = l.price_rent_period?.id;
  const service =
    typeof l.lettings_service_type === "string"
      ? l.lettings_service_type
      : (l.lettings_service_type?.text ?? null);

  const p2 = l.property;
  return {
    id: String(l.id ?? ""),
    propertyId: l.property?.id != null ? String(l.property.id) : null,
    lat: num(p2?.adr_latitude),
    lng: num(p2?.adr_longitude),
    postcode: p2?.adr_postcode ?? null,
    propertyType: p2?.property_subcategory?.text ?? null,
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
    publishedAt: published ? new Date(published * 1000).toISOString().slice(0, 10) : null,
    createdAt: isoDay(num(l.system_ctime)),
    listingState: l.system_listing_state ?? null,
    stateDate: l.state_date ?? null,
    lastUpdated: ago(num(l.system_modtime)),
    imageCount: l.related?.listing_images?.length ?? (l.listing_primary_image ? 1 : 0),
    image: https(l.listing_primary_image?.url ?? l.related?.listing_images?.[0]?.url),
    images: photos(l),
    serviceType: service,
    tenant: null, // tenancy_id is populated on 0% of the book — nothing to join to
    advertHeading: advert.heading,
    advertBody: advert.body,
  };
}

/**
 * Every rental listing REX holds in one state, paged out.
 *
 * Split out of fetchListingBook so the archive can ask for `withdrawn` with
 * the same criteria, the same multi-tenant filter and the same runaway guard.
 * The state is the ONLY difference between the two reads, and a second copy
 * of this loop is a second place for the `listing_category_id` criterion to
 * go missing - which is how the book fills up with the sales business's stock.
 */
async function searchListings(state: string, rexUserId?: string | null): Promise<RexListing[]> {
  const rows: RexListing[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await rexCall("Listings", "search", {
      criteria: [
        { name: "system_listing_state", value: state },
        // Without this the pages come back as sales stock — see note 1.
        { name: "listing_category_id", value: "residential_rental" },
        /* MULTI-TENANT. An agent sees their own book and nobody else's. The
           filter is applied at REX rather than after the fetch, so another
           agent's stock is never in this process's memory to leak. */
        ...(rexUserId ? [{ name: "listing_agent_1_id", value: rexUserId }] : []),
      ],
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      order_by: { system_modtime: "desc" },
      extra_options: { extra_fields: ["related.listing_images", "related.listing_adverts"] },
    });
    /* A refusal is NOT the end of the list (18 Sep 2026). `break` here turned
       a rate limit or a 500 into "that is everything": no listings, or the
       first hundred of 268, cached as the live book for ten minutes, feeding
       the tab counts, Find a home and Mail the database. Thrown, the cache
       keeps the last true book and the screen gets an honest error. */
    if (!res.ok) throw new RexError("Listings/search", res);
    const batch = rexRows(res.result) as RexListing[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
}

/**
 * The listings that came OFF the market without a tenant in them.
 *
 * REX's `withdrawn` state - 223 residential rentals on 14 Sep 2026, of which
 * 181 had been published and 42 never made it off draft. These have never
 * been in the OS at all, because the book only ever asks for `current`, so a
 * property the agency marketed for three months and then lost simply vanished.
 * They belong in the archive beside the stale drafts: same question ("what
 * happened to this one?"), same answer ("nothing did").
 *
 * REX's own `archived` state is empty on this account (measured, same day),
 * so there is nothing to read there.
 */
export async function fetchRetiredListings(rexUserId?: string | null): Promise<OsListing[]> {
  if (!rexConfigured()) return [];
  return (await searchListings("withdrawn", rexUserId)).map(toListing);
}

/**
 * The pulled listings that are not already in the book, read from REX by id.
 *
 * One call for all of them. Scoping is not re-checked here: it was checked
 * when the pull was made, against REX's own agent filter, and a listing that
 * has since changed hands is a listing the agent who pulled it can still see
 * the address of - which is what was already true when they found it.
 */
async function pulledIntoBook(have: string[], rexUserId?: string | null): Promise<OsListing[]> {
  const { pulledListings } = await import("@/lib/pulled-listings");
  let pulls = await pulledListings(500);
  /* THE PULLER'S OWN BOARD (18 Sep sweep, item 11). A pull went onto every
     agent's board, because the table has no idea whose book it was pulled
     into. On an agent's book, only the pulls that agent made; the whole
     business's book keeps them all. */
  if (rexUserId) {
    const { findUserByRexId } = await import("@/lib/users");
    const who = await findUserByRexId(rexUserId).catch(() => null);
    const keys = new Set([who?.email?.toLowerCase(), who?.id].filter(Boolean) as string[]);
    pulls = pulls.filter((p) => p.byUser && keys.has(p.byUser.toLowerCase()));
  }
  const wanted = pulls.map((p) => p.listingId).filter((id) => !have.includes(id));
  if (wanted.length === 0) return [];
  const res = await rexCall("Listings", "search", {
    criteria: [{ name: "id", type: "in", value: wanted }],
    limit: Math.min(wanted.length, 100),
  }).catch(() => null);
  if (!res?.ok) return [];
  /* A pulled home that has since let is not on the market: REX's own
     "current" filter would have dropped it, so the pull must too, or it
     reaches tenants as somewhere to enquire about. */
  return rexRows(res.result).map((r) => toListing(r as unknown as RexListing)).filter((l) => !l.letAgreed);
}

export async function fetchListingBook(rexUserId?: string | null): Promise<ListingBook> {
  if (!rexConfigured()) {
    return {
      listings: [],
      counts: { currentRentals: 0, published: 0, draft: 0, letAgreed: 0, available: 0, withPhoto: 0, withRent: 0, withWriteUp: 0, draftsMissingWriteUp: 0 },
      pulledAt: new Date().toISOString(),
    };
  }

  const listings = (await searchListings("current", rexUserId)).map(toListing);

  /* Anything somebody pulled in from the REX search joins the book here.
     REX hands us `current` residential rentals and nothing else, so a let
     property, or one in another category, is invisible to the OS however
     well an agent remembers it. A pull says "carry this one too", and this is
     where it is carried - fetched from REX with everything else rather than
     stored, so there is still one source of truth. See lib/pulled-listings. */
  const extra = await pulledIntoBook(listings.map((l) => String(l.id)), rexUserId);
  listings.push(...extra);

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
      withWriteUp: listings.filter((l) => l.advertBody).length,
      draftsMissingWriteUp: listings.filter((l) => !l.advertBody && l.publicationStatus === "draft").length,
    },
    pulledAt: new Date().toISOString(),
  };
}
