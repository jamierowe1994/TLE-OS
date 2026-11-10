import "server-only";
import { readListingDetails } from "@/lib/listing-details";
import { OFFICE_PHONE } from "@/lib/agent-phone";
import { noDashes } from "@/lib/no-dashes";
import { londonToday } from "@/lib/london-clock";

/**
 * THE VIEWING BROCHURE (Erleta Vathej, ticket 47b2389c: "could we make a
 * option for us to print brochure of the properties so we can hand out at
 * viewings"; James, 10 Nov 2026: a printable A4 sheet, NO landlord details).
 *
 * Built from the listing as it is in the listings system right now - the
 * same live read the listing page shows (lib/listing-details) - so nobody
 * types anything twice and a rent changed this morning prints as it is now.
 *
 * What goes on the paper is chosen here, field by field, and nothing else
 * leaves the server: the photos, the advert heading and write-up, the key
 * features, rent, bedrooms, the kind of home, when it is free, the EPC, and
 * the listing agent's name and email with the office line. Never the
 * landlord, never the house number: the address is the street and the
 * postcode district ("Moor Street, EH6"), as the portals print it.
 *
 * Only a published listing prints. A draft is not on the market, and a
 * brochure for it would be handing out a home nobody has agreed to let.
 *
 * Behind the "Print a brochure for viewings" switch (lib/switches,
 * listing_brochure) and the new look; app/brochure and the buttons ask both.
 */

export interface Brochure {
  id: string;
  /** "Moor Street, EH6" - street and postcode district only. */
  place: string;
  town: string;
  heading: string;
  /** The write-up, in paragraphs. */
  paragraphs: string[];
  features: string[];
  rent: string | null;
  beds: number | null;
  baths: number | null;
  propertyType: string | null;
  available: string;
  epc: string | null;
  /** The main photo first, then up to four more. */
  photos: string[];
  agent: { name: string | null; email: string | null; officePhone: string };
}

/** The outward half of a postcode: "EH6 4AB" -> "EH6". */
export function postcodeDistrict(postcode: string): string {
  const p = postcode.trim().toUpperCase().replace(/\s+/g, " ");
  if (!p) return "";
  if (p.includes(" ")) return p.split(" ")[0];
  /* Written without its space: the inward half is always three characters. */
  return p.length > 4 ? p.slice(0, -3) : p;
}

const longDay = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });

/** REX's write-up is plain text; anything tag-shaped is dropped, never drawn. */
function paragraphsOf(body: string): string[] {
  return noDashes(body.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, ""))
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
}

export type BrochureRead = { ok: true; brochure: Brochure } | { ok: false; status: number; error: string };

export async function brochureFor(id: number): Promise<BrochureRead> {
  let d;
  try {
    /* Display only, so a read from the last two minutes is fine (lib/staleness). */
    d = await readListingDetails(id, { cached: true });
  } catch (e) {
    return { ok: false, status: 502, error: e instanceof Error ? e.message : "The listings system did not answer." };
  }
  if (d.status !== "published") {
    return { ok: false, status: 409, error: "Only a live listing prints a brochure. This one isn't on the market." };
  }
  const district = postcodeDistrict(d.postcode);
  const street = d.streetName.replace(/^\s*[\d/-]+[a-z]?\s+/i, "").trim();
  const weekly = /week/i.test(d.rentPeriod ?? "");
  const today = londonToday();
  return {
    ok: true,
    brochure: {
      id: d.id,
      place: [street, district].filter(Boolean).join(", "),
      town: d.town,
      heading: noDashes(d.heading.trim()),
      paragraphs: paragraphsOf(d.body),
      features: d.highlights.map((h) => noDashes(h)).slice(0, 10),
      rent: d.rent != null ? `£${d.rent.toLocaleString("en-GB")} ${weekly ? "per week" : "pcm"}` : null,
      beds: d.beds,
      baths: d.baths,
      propertyType: d.propertyType,
      available: !d.availableFrom || d.availableFrom.slice(0, 10) <= today ? "Now" : longDay(d.availableFrom),
      epc: d.epc.band ?? d.epc.rating ?? null,
      photos: d.images.slice(0, 5).map((m, i) => (i === 0 ? m.url : m.thumb || m.url)),
      agent: { name: d.agent.name, email: d.agent.email, officePhone: OFFICE_PHONE },
    },
  };
}
