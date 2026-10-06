import "server-only";
import { bookFor } from "@/lib/listings-cache";
import { managedBookFor } from "@/lib/managed-book-cache";
import { archiveOf } from "@/lib/listing-archive";
import { archiveOverrides } from "@/lib/listing-archive-store";
import { letsByProperty, letElsewhereOf } from "@/lib/listings-archive-view";

/**
 * A property, and the few facts an agent needs standing outside it - the
 * phone view's Find a Property and its appointment screen share this.
 *
 * READ ONLY. Answers from the two books the Listings and Portfolio screens
 * already fill, so a keystroke never walks REX.
 */

export interface PhoneProperty {
  key: string;
  name: string;
  locality: string;
  /** "£1,150 pcm" / "£275 pw", or empty when REX has no rent. */
  rent: string;
  /** "On the market", "Let agreed", "Not yet live", "Managed", "Let". */
  status: string;
  availableFrom: string | null;
  propertyType: string | null;
  image: string | null;
  /** Who lives there now, when anybody does - a tenanted viewing needs a knock first. */
  tenants: { name: string; phone: string }[];
  landlord: { name: string; phone: string; email: string } | null;
  lat: number | null;
  lng: number | null;
  postcode: string | null;
  /** Every photo, for the app's gallery. Only the whole-book read fills it. */
  images?: string[];
  /** Which of the app's chips it sits under (bookPhoneProperties). */
  group?: PropertyGroup;
  daysOnMarket?: number | null;
  /** Managed / Let Only / Rent Collect, where REX says. */
  service?: string | null;
}

export type PropertyGroup = "market" | "letagreed" | "draft" | "managed" | "archived";

const money = (n: number | null, period: "month" | "week" | null) =>
  n == null ? "" : `£${Math.round(n).toLocaleString("en-GB")} ${period === "week" ? "pw" : "pcm"}`;

function matches(needle: string, ...fields: (string | null | undefined)[]): boolean {
  const n = needle.toLowerCase().replace(/\s+/g, " ");
  return fields.some((f) => Boolean(f) && String(f).toLowerCase().replace(/\s+/g, " ").includes(n));
}

/** Null when neither book loaded, so the caller can say so rather than show nothing. */
export async function searchPhoneProperties(rexUserId: string | null, needle: string): Promise<PhoneProperty[] | null> {
  const [book, managed] = await Promise.all([
    bookFor(rexUserId).catch(() => null),
    managedBookFor(rexUserId).then((m) => m.book).catch(() => null),
  ]);
  if (!book && !managed) return null;

  const out: PhoneProperty[] = [];
  const managedByListing = new Map((managed?.properties ?? []).map((m) => [String(m.listingId), m]));

  for (const l of book?.listings ?? []) {
    if (out.length >= 25) break;
    if (!matches(needle, l.name, l.locality, l.postcode)) continue;
    const m = managedByListing.get(String(l.id));
    out.push({
      key: `l-${l.id}`,
      name: l.name,
      locality: l.locality,
      rent: money(l.rent, l.rentPeriod),
      status: l.letAgreed ? "Let agreed" : l.publicationStatus === "published" ? "On the market" : "Not yet live",
      availableFrom: l.availableFrom,
      propertyType: l.propertyType,
      image: l.image,
      tenants: (m?.tenants ?? []).map((t) => ({ name: t.name, phone: t.phone ?? "" })),
      landlord: m?.landlord ? { name: m.landlord.name, phone: m.landlord.phone ?? "", email: m.landlord.email ?? "" } : null,
      lat: l.lat,
      lng: l.lng,
      postcode: l.postcode,
    });
  }

  const listed = new Set((book?.listings ?? []).map((l) => String(l.id)));
  for (const m of managed?.properties ?? []) {
    if (out.length >= 25) break;
    if (listed.has(String(m.listingId))) continue;
    if (!matches(needle, m.name, m.locality, m.address, m.postcode)) continue;
    out.push({
      key: `m-${m.listingId}`,
      name: m.name,
      locality: m.locality,
      rent: money(m.rent, m.rentPeriod),
      status: m.service ? m.service : "Let",
      availableFrom: null,
      propertyType: null,
      image: m.image,
      tenants: m.tenants.map((t) => ({ name: t.name, phone: t.phone ?? "" })),
      landlord: m.landlord ? { name: m.landlord.name, phone: m.landlord.phone ?? "", email: m.landlord.email ?? "" } : null,
      lat: m.lat,
      lng: m.lng,
      postcode: m.postcode,
    });
  }

  return out;
}

/**
 * The agent's whole book for the app's Properties tab (3 Oct 2026, James's
 * mockup): every current listing - on the market, let agreed, not yet live,
 * or put away in the archive by the same rule the Listings screen uses - and
 * every managed home that is not also a current listing. Searching and the
 * chips happen on the phone, so a keystroke costs nothing. Null when neither
 * book loaded, so the screen can say so instead of showing an empty list.
 */
export async function bookPhoneProperties(rexUserId: string | null): Promise<PhoneProperty[] | null> {
  const [book, managed, overrides] = await Promise.all([
    bookFor(rexUserId).catch(() => null),
    managedBookFor(rexUserId).then((m) => m.book).catch(() => null),
    archiveOverrides().catch(() => new Map()),
  ]);
  /* The same "let on another listing" rule the Listings screen uses (6 Oct 2026). */
  const lets = await letsByProperty().catch(() => new Map());
  if (!book && !managed) return null;

  const managedByListing = new Map((managed?.properties ?? []).map((m) => [String(m.listingId), m]));
  const out: PhoneProperty[] = [];

  for (const l of book?.listings ?? []) {
    const m = managedByListing.get(String(l.id));
    const archived = archiveOf(l, overrides.get(String(l.id)), letElsewhereOf(l, lets)).archived;
    const group: PropertyGroup = archived ? "archived" : l.letAgreed ? "letagreed" : l.publicationStatus === "published" ? "market" : "draft";
    out.push({
      key: `l-${l.id}`,
      name: l.name,
      locality: l.locality,
      rent: money(l.rent, l.rentPeriod),
      status: archived ? "Archived" : l.letAgreed ? "Let agreed" : l.publicationStatus === "published" ? "On the market" : "Not yet live",
      availableFrom: l.availableFrom,
      propertyType: l.propertyType,
      image: l.image,
      images: l.images.slice(0, 12),
      tenants: (m?.tenants ?? []).map((t) => ({ name: t.name, phone: t.phone ?? "" })),
      landlord: m?.landlord ? { name: m.landlord.name, phone: m.landlord.phone ?? "", email: m.landlord.email ?? "" } : null,
      lat: l.lat,
      lng: l.lng,
      postcode: l.postcode,
      group,
      daysOnMarket: l.daysOnMarket,
      service: l.serviceType,
    });
  }

  const listed = new Set((book?.listings ?? []).map((l) => String(l.id)));
  for (const m of managed?.properties ?? []) {
    if (listed.has(String(m.listingId))) continue;
    out.push({
      key: `m-${m.listingId}`,
      name: m.name,
      locality: m.locality,
      rent: money(m.rent, m.rentPeriod),
      status: m.service ? m.service : "Let",
      availableFrom: null,
      propertyType: null,
      image: m.image,
      images: m.images.slice(0, 12),
      tenants: m.tenants.map((t) => ({ name: t.name, phone: t.phone ?? "" })),
      landlord: m.landlord ? { name: m.landlord.name, phone: m.landlord.phone ?? "", email: m.landlord.email ?? "" } : null,
      lat: m.lat,
      lng: m.lng,
      postcode: m.postcode,
      group: "managed",
      daysOnMarket: null,
      service: m.service,
    });
  }

  return out;
}
