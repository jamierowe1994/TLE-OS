import "server-only";
import { rexCall } from "@/lib/rex";

/**
 * ONE LISTING, AS THE PORTALS WILL SEE IT - read live from REX, and written
 * back to it (15 Sep 2026).
 *
 * The listing book is a cached projection built for the board: it never
 * carried bedrooms, key features, floor plans or the property's material
 * information, and it goes stale for minutes after anything changes. The
 * Marketing tab and the portal preview need the real thing, so they read it
 * here, one listing at a time, straight from REX.
 *
 * ── Where REX keeps what ──────────────────────────────────────────────────
 *
 *   The LISTING   rent, advertised price, deposit (price_bond), available
 *                 date, the internet advert, highlights (the portals' key
 *                 features), images, floor plans, EPC, the subcategory.
 *   The PROPERTY  bedrooms, bathrooms, receptions (attr_living_areas),
 *                 parking, council tax band, and the material information
 *                 (attr_broadband, attr_primary_water_supply, ...).
 *
 * ── What REX itself insists on (measured 15 Sep 2026 on 100 rentals) ─────
 *
 *   To publish:        rent, advertised price, primary agent, a heading and
 *                      body on the internet advert, a primary image.
 *   To reach portals:  all of that, plus an available date, bedrooms,
 *                      bathrooms and a subcategory. Zoopla also refuses a
 *                      heading over 255 characters.
 *
 * Both lists come from REX's own checks (getErrorsPreventingPublication and
 * ListingPortalUploads/getErrorsPreventingUpload) rather than being copied
 * here, so a rule REX adds tomorrow shows up without a release.
 */

export interface ListingMedia {
  id: string;
  url: string;
  thumb: string;
  priority: number;
}

export interface ListingDetails {
  id: string;
  propertyId: string | null;
  address: string;
  street: string;
  /** "The Green" - what the portals print, without the house number. */
  streetName: string;
  town: string;
  postcode: string;
  status: string | null;
  rent: number | null;
  rentPeriod: string | null;
  advertisedAs: string | null;
  deposit: number | null;
  availableFrom: string | null;
  heading: string;
  body: string;
  highlights: string[];
  images: ListingMedia[];
  floorplans: ListingMedia[];
  beds: number | null;
  baths: number | null;
  receptions: number | null;
  propertyType: string | null;
  letType: string | null;
  service: string | null;
  councilTaxBand: string | null;
  parking: string | null;
  epc: { rating: string | null; expiry: string | null; chartUrl: string | null; fileUrl: string | null };
  material: { electricity: string | null; water: string | null; sewerage: string | null; broadband: string | null; gas: string | null };
  agent: { name: string | null; phone: string | null; email: string | null };
  blockers: { publish: string[]; portals: string[] };
  modifiedAt: string | null;
}

type Obj = Record<string, unknown>;

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
/** REX's value-list fields come back as { id, text }. */
const text = (v: unknown): string | null => (v && typeof v === "object" ? str((v as Obj).text) : str(v));
const yesNo = (v: unknown): string | null => (v === "yes" || v === true || v === 1 ? "Yes" : v === "no" || v === false || v === 0 ? "No" : text(v));
/** REX hands back protocol-relative CDN addresses. */
const abs = (u: unknown): string | null => {
  const s = str(u);
  return s ? (s.startsWith("//") ? `https:${s}` : s) : null;
};

function media(rows: unknown, thumbSize: string): ListingMedia[] {
  if (!Array.isArray(rows)) return [];
  return (rows as Obj[])
    .map((r) => {
      const thumbs = (r.thumbs ?? {}) as Record<string, { url?: string }>;
      const url = abs(r.url);
      return url
        ? { id: String(r.id), url, thumb: abs(thumbs[thumbSize]?.url) ?? url, priority: num(r.priority) ?? 999 }
        : null;
    })
    .filter((m): m is ListingMedia => m !== null)
    .sort((a, b) => a.priority - b.priority);
}

function messages(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (v && typeof v === "object") return Object.values(v as Obj).flatMap((x) => (Array.isArray(x) ? x.map(String) : [String(x)]));
  return [];
}

export async function readListingDetails(id: number): Promise<ListingDetails> {
  const res = await rexCall("Listings", "read", { id });
  if (!res.ok || !res.result) throw new Error(res.error ?? "REX would not read that listing.");
  const l = res.result as Obj;
  const related = (l.related ?? {}) as Obj;
  const embedded = (l.property ?? {}) as Obj;
  const propertyId = embedded.id != null ? String(embedded.id) : l.property_id != null ? String(l.property_id) : null;

  const [propRes, pubErr, upErr] = await Promise.all([
    propertyId ? rexCall("Properties", "read", { id: Number(propertyId) }) : Promise.resolve(null),
    rexCall("ListingPublication", "getErrorsPreventingPublication", { listing_id: id }),
    rexCall("ListingPortalUploads", "getErrorsPreventingUpload", { listing_id: id }),
  ]);
  const p = ((propRes?.ok ? propRes.result : null) ?? embedded) as Obj;

  const adverts = Array.isArray(related.listing_adverts) ? (related.listing_adverts as Obj[]) : [];
  const internet = adverts.find((a) => a.advert_type === "internet") ?? {};
  const highlights = Array.isArray(related.listing_highlights)
    ? (related.listing_highlights as Obj[])
        .slice()
        .sort((a, b) => (num(a.priority) ?? 0) - (num(b.priority) ?? 0))
        .map((h) => str(h.description))
        .filter((h): h is string => h !== null)
    : [];
  const subcats = Array.isArray(related.listing_subcategories) ? (related.listing_subcategories as Obj[]) : [];
  const agent = (l.listing_agent_1 ?? {}) as Obj;
  const street = [str(p.adr_unit_number), str(p.adr_street_number), str(p.adr_street_name)].filter(Boolean).join(" ");
  const town = str(p.adr_suburb_or_town) ?? "";
  const postcode = str(p.adr_postcode) ?? "";
  const modtime = num(l.system_modtime);

  return {
    id: String(id),
    propertyId,
    address: str(p.system_search_key) ?? [street, town, postcode].filter(Boolean).join(", "),
    street,
    streetName: str(p.adr_street_name) ?? street,
    town,
    postcode,
    status: str(l.system_publication_status),
    rent: num(l.price_rent),
    rentPeriod: text(l.price_rent_period),
    advertisedAs: str(l.price_advertise_as),
    deposit: num(l.price_bond),
    availableFrom: str(l.available_from_date),
    heading: str(internet.advert_heading) ?? "",
    body: typeof internet.advert_body === "string" ? internet.advert_body : "",
    highlights,
    images: media(related.listing_images, "800x600"),
    floorplans: media(related.listing_floorplans, "800x800"),
    beds: num(p.attr_bedrooms),
    baths: num(p.attr_bathrooms),
    receptions: num(p.attr_living_areas),
    propertyType: text((subcats[0] ?? {}).subcategory) ?? text(p.property_subcategory),
    letType: text(l.let_type),
    service: text(l.lettings_service_type),
    councilTaxBand: str(p.meta_tax_band) ?? str(p.meta_rates_council),
    parking: text(p.attr_parking_type) ?? yesNo(p.attr_has_parking),
    epc: {
      rating: str(l.epc_rating),
      expiry: str(l.epc_expiry_date),
      chartUrl: abs((l.epc_combined_chart as Obj | null)?.url ?? (l.epc_eer_chart as Obj | null)?.url),
      fileUrl: abs((l.epc_file as Obj | null)?.url),
    },
    material: {
      electricity: text(p.attr_primary_electricity_supply),
      water: text(p.attr_primary_water_supply),
      sewerage: text(p.attr_primary_sewerage),
      broadband: text(p.attr_broadband),
      gas: yesNo(p.attr_has_gas),
    },
    agent: { name: str(agent.name), phone: str(agent.phone_mobile) ?? str(agent.phone_direct), email: str(agent.email_address) },
    blockers: {
      publish: pubErr.ok ? messages(pubErr.result) : [],
      portals: upErr.ok ? messages(upErr.result) : [],
    },
    modifiedAt: modtime ? new Date(modtime * 1000).toISOString() : null,
  };
}

/** What the Marketing tab may change. Anything left out is left alone. */
export interface ListingEdit {
  rent?: number | null;
  deposit?: number | null;
  availableFrom?: string | null;
  heading?: string;
  body?: string;
  highlights?: string[];
  /** Image ids in the order they should show; the first is the main photo. */
  imageOrder?: string[];
  beds?: number | null;
  baths?: number | null;
  receptions?: number | null;
}

export const MAX_HIGHLIGHTS = 10;

/**
 * Build the two REX writes for an edit, against the listing as it stands.
 *
 * Related rows follow REX's rule for related collections: a row with an id
 * updates that row, a row without one is created, and `destroy: true` on an
 * id removes it. Adverts are the exception, addressed by advert_type (proven
 * on the write-up, 11 Aug 2026).
 */
export async function planListingWrite(id: number, edit: ListingEdit): Promise<{ listing: Obj | null; property: Obj | null; propertyId: string | null }> {
  const res = await rexCall("Listings", "read", { id });
  if (!res.ok || !res.result) throw new Error(res.error ?? "REX would not read that listing.");
  const l = res.result as Obj;
  const related = (l.related ?? {}) as Obj;
  const embedded = (l.property ?? {}) as Obj;
  const propertyId = embedded.id != null ? String(embedded.id) : null;

  const data: Obj = { id };
  const rel: Obj = {};
  if (edit.rent !== undefined) {
    data.price_rent = edit.rent;
    data.price_advertise_as = edit.rent == null ? null : `£${edit.rent.toLocaleString("en-GB")}`;
  }
  if (edit.deposit !== undefined) data.price_bond = edit.deposit;
  if (edit.availableFrom !== undefined) data.available_from_date = edit.availableFrom;
  if (edit.heading !== undefined || edit.body !== undefined) {
    const adverts = Array.isArray(related.listing_adverts) ? (related.listing_adverts as Obj[]) : [];
    const internet = adverts.find((a) => a.advert_type === "internet") ?? {};
    rel.listing_adverts = [
      {
        advert_type: "internet",
        advert_heading: edit.heading ?? internet.advert_heading ?? null,
        advert_body: edit.body ?? internet.advert_body ?? null,
      },
    ];
  }
  if (edit.highlights) {
    const wanted = edit.highlights.map((h) => h.trim()).filter(Boolean).slice(0, MAX_HIGHLIGHTS);
    const held = Array.isArray(related.listing_highlights)
      ? (related.listing_highlights as Obj[]).slice().sort((a, b) => (num(a.priority) ?? 0) - (num(b.priority) ?? 0))
      : [];
    const rows: Obj[] = wanted.map((description, i) =>
      held[i]?.id != null ? { id: held[i].id, description, priority: i + 1 } : { description, priority: i + 1 }
    );
    for (const extra of held.slice(wanted.length)) if (extra.id != null) rows.push({ id: extra.id, destroy: true });
    rel.listing_highlights = rows;
  }
  if (edit.imageOrder?.length) {
    const held = new Set(Array.isArray(related.listing_images) ? (related.listing_images as Obj[]).map((r) => String(r.id)) : []);
    const order = edit.imageOrder.filter((x) => held.has(x));
    if (order.length) rel.listing_images = order.map((imgId, i) => ({ id: Number(imgId), priority: i + 1 }));
  }
  if (Object.keys(rel).length) data.related = rel;

  const prop: Obj = {};
  if (edit.beds !== undefined) prop.attr_bedrooms = edit.beds;
  if (edit.baths !== undefined) prop.attr_bathrooms = edit.baths;
  if (edit.receptions !== undefined) prop.attr_living_areas = edit.receptions;

  return {
    listing: Object.keys(data).length > 1 ? data : null,
    property: Object.keys(prop).length && propertyId ? { id: Number(propertyId), ...prop } : null,
    propertyId,
  };
}
