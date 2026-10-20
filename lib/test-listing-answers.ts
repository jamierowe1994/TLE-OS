import "server-only";
import { hasDb, q } from "@/lib/db";
import { isIntroOnly } from "@/lib/intro-only";
import type { ListingDetails } from "@/lib/listing-details";
import type { Viewing } from "@/lib/rex-viewings";
import { isDraftTest, kitPeopleForTestListing, testListing, testViewingsForListing, type TestListing } from "@/lib/test-overlay";

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
    deposit: l.deposit ?? Math.round((l.rent * 12 * 5) / 52),
    /* A draft made by New listing carries its date, so the portals' minimum
       (lib/listing-requirements) passes and Push to the portals lights up. */
    availableFrom: l.availableFrom ?? null,
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
    service: (await isIntroOnly(l.listingId).catch(() => false)) ? "Marketing only" : "Fully managed",
    serviceOnRecord: "Fully managed",
    councilTaxBand: "B",
    parking: "On street",
    epc: { rating: "C", expiry: null, lodged: null, chartUrl: null, fileUrl: null, current: 72, potential: 80, band: "C" },
    propertyTypeId: null,
    agentLarn: null,
    propertyTypeRowId: null,
    record: { osPropertyId: null, factsKey: null, landlordName: null, landlordRegistration: null, epc: null, scotland: false },
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

/**
 * The test listing's landlord. The phone used to be null always, so the
 * listing said "No number on file" over Landlord E2E's 07700 900000 (James,
 * 13 Oct 2026, the E2E walk). Now: the number the listing was made with, else
 * the file's own landlord contact's (the one named on it first).
 */
export async function testLandlord(id: number) {
  const l = await testListing(id);
  if (!l) return null;
  let phone = (l.landlord.phone ?? "").trim() || null;
  if (!phone) {
    const people = (await kitPeopleForTestListing(id)).filter((c) => c.kind === "landlord" && c.mobile.trim());
    const named = people.find((c) => c.name.trim().toLowerCase() === l.landlord.name.trim().toLowerCase()) ?? people[0];
    phone = named?.mobile.trim() || null;
  }
  return { ok: true as const, landlord: { contactId: null, name: l.landlord.name, email: l.landlord.email, phone } };
}

/**
 * Where a test listing is published. A draft (made by New listing, 13 Oct
 * 2026) answers draft with no blockers, so the listing shows its Push to the
 * portals button; everything else is live, as it always was.
 */
export async function testPublication(id: number) {
  const l = await testListing(id);
  if (!l) return null;
  const draft = isDraftTest(l);
  return {
    ok: true,
    id,
    status: draft ? "draft" : "published",
    channels: draft ? [] : ["portals", "automatch", "external", "general"],
    onPortals: !draft,
    blockers: [],
    warnings: [],
    test: true,
  };
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
  /* The tenant behind each one, so their name on the listing opens their
     record like a real applicant's (James, 20 Sep 2026). A test file's
     tenant is an OS contact, whose lead id is "os-<contact id>". */
  /* Every test person shares the tester's email, so the email alone picked
     whichever test contact came first; the name the viewing was booked for
     decides it now, the email only when no name matches (13 Oct 2026). */
  const leadFor = new Map<string, string>();
  const names = hasDb() && vs.length
    ? new Map((await q<{ id: string; who: string; mins: number }>(`SELECT id, who, mins FROM os_appointments WHERE id = ANY($1)`, [vs.map((v) => v.appointmentId)]).catch(() => [])).map((r) => [r.id, r]))
    : new Map<string, { id: string; who: string; mins: number }>();
  if (hasDb() && vs.length) {
    const emails = [...new Set(vs.map((v) => v.tenantEmail.toLowerCase()).filter(Boolean))];
    const found = emails.length
      ? await q<{ id: string; email: string; name: string }>(`SELECT id, LOWER(email) AS email, LOWER(TRIM(name)) AS name FROM os_contacts WHERE LOWER(email) = ANY($1) AND is_test ORDER BY created_at ASC`, [emails]).catch(() => [])
      : [];
    for (const c of found) {
      if (!leadFor.has(`${c.email}|${c.name}`)) leadFor.set(`${c.email}|${c.name}`, `os-${c.id}`);
      if (!leadFor.has(c.email)) leadFor.set(c.email, `os-${c.id}`);
    }
  }
  const leadOf = (email: string, who: string | undefined) =>
    leadFor.get(`${email.toLowerCase()}|${(who ?? "").trim().toLowerCase()}`) ?? leadFor.get(email.toLowerCase()) ?? null;
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
      contacts: [{ id: `test-${v.appointmentId}`, name: row?.who || "Test applicant", email: v.tenantEmail, phone: null, leadId: leadOf(v.tenantEmail, row?.who) }],
      feedbackId: null,
      bookedAt: null,
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
