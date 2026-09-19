import "server-only";
import { hasDb, q } from "@/lib/db";
import type { ListingDetails } from "@/lib/listing-details";
import type { Viewing } from "@/lib/rex-viewings";
import { testListing, testViewingsForListing, type TestListing } from "@/lib/test-overlay";

/**
 * What each listing route answers for a TEST listing (negative id, lib/test-
 * overlay), so the listing's file opens and reads like a live one: its
 * details, its landlord, where it is published, its portals and its
 * viewings. Every route that WRITES refuses a test listing instead
 * (TEST_REFUSAL) - nothing about it can reach REX, a portal or the database
 * of tenants.
 */

export const TEST_REFUSAL = "This is a test listing - nothing is sent to REX, the portals or anybody's inbox from it.";

export async function testDetails(id: number): Promise<{ ok: true; details: ListingDetails; locks: Record<string, boolean>; test: true } | null> {
  const l = await testListing(id);
  if (!l) return null;
  const street = l.name.replace(/^\d+[a-z]?\s+/i, "");
  const details: ListingDetails = {
    id: String(l.listingId),
    propertyId: null,
    address: `${l.name}, ${l.locality} ${l.postcode}`,
    street: l.name,
    streetName: street,
    town: l.locality,
    postcode: l.postcode,
    status: "current",
    rent: l.rent,
    rentPeriod: "month",
    advertisedAs: `£${l.rent.toLocaleString("en-GB")} pcm`,
    deposit: Math.round((l.rent * 12 * 5) / 52),
    availableFrom: null,
    heading: l.heading,
    body: l.body,
    highlights: ["Two double bedrooms", "Newly fitted kitchen", "Garden", "Close to the tram"],
    images: l.images.map((url, i) => ({ id: `test-${i}`, url, thumb: url, priority: i })),
    floorplans: [],
    beds: l.beds,
    baths: l.baths,
    receptions: 1,
    propertyType: l.propertyType,
    letType: "Long term",
    service: "Fully managed",
    councilTaxBand: "B",
    parking: "On street",
    epc: { rating: "C", expiry: null, chartUrl: null, fileUrl: null },
    material: { electricity: "Mains", water: "Mains", sewerage: "Mains", broadband: "Fibre", gas: "Mains" },
    agent: { id: null, name: null, phone: null, email: null },
    facts: {
      councilTaxBand: "B", parking: "On street", electricity: "Mains", water: "Mains", sewerage: "Mains", broadband: "Fibre",
      heating: "Gas central heating", furnishing: "Unfurnished", pets: "Considered", outsideSpace: "Garden", floorAreaSqft: 720,
    },
    sources: {},
    blockers: { publish: [], portals: [] },
    modifiedAt: l.publishedAt,
  };
  /* Locked, all of it: the marketing form shows but saves nothing. */
  return { ok: true, details, locks: { listing: true, rooms: true, media: true }, test: true };
}

export async function testLandlord(id: number) {
  const l = await testListing(id);
  return l ? { ok: true, landlord: { contactId: null, name: l.landlord.name, email: l.landlord.email, phone: null } } : null;
}

export async function testPublication(id: number) {
  const l = await testListing(id);
  return l ? { ok: true, id, status: "published", channels: ["portals", "website"], onPortals: true, blockers: [], warnings: [], test: true } : null;
}

export async function testPortals(id: number) {
  const l = await testListing(id);
  return l ? { ok: true, listingId: String(id), portals: l.portals } : null;
}

/** The test listing's viewings as REX-shaped ones, from the tester's diary rows. */
export async function testListingViewings(id: number) {
  const l: TestListing | null = await testListing(id);
  if (!l) return null;
  const vs = await testViewingsForListing(id);
  const names = hasDb() && vs.length
    ? new Map((await q<{ id: string; who: string; mins: number }>(`SELECT id, who, mins FROM os_appointments WHERE id = ANY($1)`, [vs.map((v) => v.appointmentId)]).catch(() => [])).map((r) => [r.id, r]))
    : new Map<string, { id: string; who: string; mins: number }>();
  const all: Viewing[] = vs.map((v) => {
    const row = names.get(v.appointmentId);
    return {
      id: `os-${v.appointmentId}`,
      rexEventId: "",
      listingId: String(id),
      listingLabel: l.name,
      propertyId: null,
      startsAt: v.startsAt,
      endsAt: null,
      mins: row?.mins ?? 30,
      kind: "viewing",
      title: `Viewing: ${l.name}`,
      type: "TLE Accompanied Viewing",
      status: v.done ? "completed" : "booked",
      cancelled: false,
      agent: v.withName,
      contacts: [{ id: `test-${v.appointmentId}`, name: row?.who || "Test applicant", email: v.tenantEmail, phone: null, leadId: null }],
      feedbackId: null,
      description: null,
    };
  });
  const now = Date.now();
  return {
    ok: true,
    live: true,
    upcoming: all.filter((v) => new Date(v.startsAt).getTime() >= now),
    past: all.filter((v) => new Date(v.startsAt).getTime() < now),
    count: all.length,
  };
}
