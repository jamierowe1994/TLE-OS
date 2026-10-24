import type { OsListing } from "@/lib/rex-listings";
import type { ListingExtra } from "./listing-extras";

/**
 * A listing as the website's lib/listing-shape.ts Listing type, built from
 * the OS book plus the extras index. Field for field the same, so the
 * website can swap its REX read for this feed without reshaping.
 */
export interface WebsiteListing {
  id: string;
  slug: string;
  propertyId: string | null;
  name: string;
  town: string | null;
  postcode: string | null;
  district: string | null;
  locality: string;
  lat: number | null;
  lng: number | null;
  rent: number | null;
  rentPeriod: "month" | "week" | null;
  /** Sorting and banding only. Never display. */
  rentMonthly: number | null;
  deposit: number | null;
  letAgreed: boolean;
  availableFrom: string | null;
  epcRating: string | null;
  councilTaxIncluded: boolean | null;
  minimumTermMonths: number | null;
  propertyType: string | null;
  serviceType: string | null;
  publishedAt: string | null;
  daysOnMarket: number | null;
  image: string | null;
  images: string[];
  imageCount: number;
  heading: string | null;
  body: string | null;
  highlights: string[];
  agent: ListingExtra["agent"];
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** flat-2-milton-street-northampton-536306: readable, id at the end resolves it. */
export function listingSlug(name: string, town: string | null, id: string): string {
  const base = slugify([name, town].filter(Boolean).join(" ")) || "home";
  return `${base}-${id}`;
}

const https = (u: string | null): string | null => (u ? (u.startsWith("//") ? `https:${u}` : u) : null);

export function toWebsiteListing(l: OsListing, x: ListingExtra | null): WebsiteListing {
  const postcode = l.postcode?.trim() || null;
  /* The book keeps "town postcode" as one line; the extras carry the town on
     its own, and failing that it is the line with the postcode taken off. */
  const fromLocality = postcode && l.locality.endsWith(postcode) ? l.locality.slice(0, -postcode.length).trim() : l.locality.trim();
  const town = x?.town ?? (fromLocality && fromLocality !== "—" ? fromLocality : null);
  const images = l.images.map((u) => https(u)).filter((u): u is string => Boolean(u));
  const image = https(l.image) ?? images[0] ?? null;
  return {
    id: l.id,
    slug: listingSlug(l.name, town, l.id),
    propertyId: l.propertyId,
    name: l.name,
    town,
    postcode,
    district: postcode ? postcode.split(" ")[0].toUpperCase() : null,
    locality: [town, postcode].filter(Boolean).join(" ") || "Location to be confirmed",
    lat: l.lat,
    lng: l.lng,
    rent: l.rent,
    rentPeriod: l.rentPeriod,
    rentMonthly: l.rentMonthly,
    deposit: x?.deposit ?? null,
    letAgreed: l.letAgreed,
    availableFrom: l.availableFrom,
    epcRating: l.epcRating,
    councilTaxIncluded: x?.councilTaxIncluded ?? null,
    minimumTermMonths: x?.minimumTermMonths ?? null,
    propertyType: l.propertyType,
    serviceType: l.serviceType,
    publishedAt: l.publishedAt,
    daysOnMarket: l.daysOnMarket,
    image,
    images: image && !images.includes(image) ? [image, ...images] : images,
    imageCount: Math.max(l.imageCount, images.length),
    heading: l.advertHeading,
    body: l.advertBody,
    highlights: x?.highlights ?? [],
    agent: x?.agent ?? null,
  };
}
