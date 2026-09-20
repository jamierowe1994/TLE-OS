import "server-only";
import { randomUUID } from "node:crypto";
import { hasDb, q } from "@/lib/db";
import { PORTAL_STAGES } from "@/lib/business/propoly-stages";
import type { OsListing } from "@/lib/rex-listings";
import type { Application } from "@/lib/applications";
import type { ApplicationJourney, JourneyAction, JourneyStop } from "@/lib/application-journey";

/**
 * THE TEST OVERLAY (James, 19 Sep 2026: take the test files past the viewing
 * - "listing done ... gone live on the portals ... offer received", and for
 * the tenant "viewing booked, offer made, compliance").
 *
 * Everything after a viewing is read live from REX (listings, applications,
 * the landlord's offers) or Propoly (the deal's stages). Both are read-only
 * to us, so a test file cannot put a listing or an offer in them. Instead the
 * later stages live here, in os_test_records, and the screens that read REX
 * and Propoly read these rows as well - ONLY for the tester who owns the file:
 *
 *   /listings, the listing's file     testListingsFor, testListing
 *   /applications, its journey        testApplicationsFor, testApplication
 *   the landlord portal               testOffersForAppraisal, testListingForAppraisal, testDealForAppraisal
 *   the tenant portal                 testDealsForTenant, testViewingForTenant, testOfferForTenant
 *
 * Never counted: nothing that adds up the business (company figures, the
 * dashboard's tiles, Susan's view) reads this file.
 *
 * ── Negative ids ─────────────────────────────────────────────────────────
 *
 * A test listing's id, and a test application's, are NEGATIVE numbers. REX's
 * are always positive, so a test record can never collide with or be taken
 * for a real one, a screen that expects a number still gets one, and every
 * route that writes to REX, publishes or mails the database refuses a
 * negative id (isTestId) before it does anything.
 */

export type TestListing = {
  listingId: number;
  appraisalId: string | null;
  name: string;
  locality: string;
  postcode: string;
  rent: number;
  beds: number;
  baths: number;
  propertyType: string;
  images: string[];
  heading: string;
  body: string;
  publishedAt: string;
  portals: { portal: string; url: string }[];
  landlord: { name: string; email: string };
};

export type TestOffer = {
  appId: string;
  listingId: number;
  appraisalId: string | null;
  applicantName: string;
  applicantEmail: string;
  amount: number;
  moveIn: string;
  months: number;
  adults: number;
  children: number;
  pets: boolean;
  status: "received" | "accepted" | "unsuccessful";
  received: string;
  accepted: string | null;
};

export type TestDeal = {
  appId: string;
  listingId: number;
  appraisalId: string | null;
  tenantName: string;
  tenantEmail: string;
  property: string;
  locality: string;
  rent: number;
  moveIn: string;
  stageKey: string;
  agentName: string;
  agentEmail: string;
};

export type TestViewing = {
  appointmentId: string;
  listingId: number;
  tenantEmail: string;
  startsAt: string;
  withName: string;
  done: boolean;
};

type Kind = "listing" | "offer" | "deal" | "viewing";
type Row<T> = { id: string; kit_id: string; owner_email: string; payload: T };

export const isTestId = (id: unknown): boolean => {
  const n = Number(id);
  return Number.isFinite(n) && n < 0;
};

/** A fresh negative id, well clear of anything else. */
export const newTestId = () => -(1_000_000 + Math.floor(Math.random() * 8_000_000));

export async function putTestRecord<T>(kitId: string, owner: string, kind: Kind, payload: T): Promise<string> {
  const id = randomUUID();
  await q(`INSERT INTO os_test_records (id, kit_id, owner_email, kind, payload) VALUES ($1,$2,LOWER($3),$4,$5::jsonb)`, [
    id, kitId, owner, kind, JSON.stringify(payload),
  ]);
  return id;
}

export async function clearTestRecords(kitId: string): Promise<void> {
  if (!hasDb()) return;
  await q(`DELETE FROM os_test_records WHERE kit_id = $1`, [kitId]).catch(() => null);
}

async function rows<T>(kind: Kind, where: string, params: unknown[]): Promise<Row<T>[]> {
  if (!hasDb()) return [];
  return q<Row<T>>(`SELECT id, kit_id, owner_email, payload FROM os_test_records WHERE kind = $1 AND ${where} ORDER BY created_at DESC`, [kind, ...params]).catch(() => []);
}

/* ── listings ────────────────────────────────────────────────────────── */

function toOsListing(l: TestListing): OsListing {
  return {
    id: String(l.listingId),
    propertyId: null,
    name: l.name,
    locality: `${l.locality} ${l.postcode}`.trim(),
    rent: l.rent,
    rentPeriod: "month",
    rentMonthly: l.rent,
    letAgreed: false,
    publicationStatus: "published",
    availableFrom: null,
    epcExpiry: null,
    epcRating: "C",
    daysOnMarket: Math.max(0, Math.floor((Date.now() - new Date(l.publishedAt).getTime()) / 86400000)),
    publishedAt: l.publishedAt.slice(0, 10),
    createdAt: l.publishedAt.slice(0, 10),
    listingState: "current",
    stateDate: null,
    lastUpdated: l.publishedAt,
    imageCount: l.images.length,
    image: l.images[0] ?? null,
    images: l.images,
    lat: 53.4152,
    lng: -2.2294,
    postcode: l.postcode,
    propertyType: l.propertyType,
    serviceType: "Fully managed",
    tenant: null,
    advertHeading: l.heading,
    advertBody: l.body,
  };
}

/** The tester's own test listings, as the Listings board draws them. */
export async function testListingsFor(email: string | null | undefined): Promise<OsListing[]> {
  if (!email) return [];
  const [ls, deals] = await Promise.all([
    rows<TestListing>("listing", "owner_email = LOWER($2)", [email]),
    rows<TestDeal>("deal", "owner_email = LOWER($2)", [email]),
  ]);
  const agreed = new Set(deals.map((d) => d.payload.listingId));
  return ls.map((r) => ({ ...toOsListing(r.payload), letAgreed: agreed.has(r.payload.listingId) }));
}

export async function testListing(listingId: number | string): Promise<TestListing | null> {
  const r = await rows<TestListing>("listing", "(payload->>'listingId')::bigint = $2", [Number(listingId)]);
  return r[0]?.payload ?? null;
}

export async function testListingForAppraisal(appraisalId: string): Promise<TestListing | null> {
  const r = await rows<TestListing>("listing", "payload->>'appraisalId' = $2", [appraisalId]);
  return r[0]?.payload ?? null;
}

/** The viewings on a test listing, oldest first. */
export async function testViewingsForListing(listingId: number): Promise<TestViewing[]> {
  const r = await rows<TestViewing>("viewing", "(payload->>'listingId')::bigint = $2", [listingId]);
  return r.map((x) => x.payload).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/* ── applications (offers) ──────────────────────────────────────────── */

function stageLabelOf(key: string | undefined): string | undefined {
  return key ? PORTAL_STAGES.find((s) => s.key === key)?.label : undefined;
}

function toApplication(o: TestOffer, l: TestListing | null, deal: TestDeal | null): Application {
  return {
    id: o.appId,
    status: o.status,
    statusLabel: o.status === "accepted" ? "Accepted" : o.status === "unsuccessful" ? "Unsuccessful" : "Received",
    stageLabel: stageLabelOf(deal?.stageKey),
    closed: null,
    listingId: o.listingId,
    propertyId: null,
    property: l?.name ?? "Test listing",
    locality: l ? `${l.locality} ${l.postcode}`.trim() : "",
    image: l?.images[0] ?? null,
    agent: deal?.agentName ?? null,
    offerAmount: o.amount,
    offerPeriod: "month",
    startDate: o.moveIn,
    agreementMonths: o.months,
    occupants: o.adults,
    households: 1,
    dependents: o.children,
    hasPets: o.pets,
    affordabilityPct: 34,
    totalIncome: 36000,
    holdingDepositAmount: Math.round((o.amount * 12) / 52),
    dateReceived: o.received,
    dateAccepted: o.accepted,
    conditions: null,
    applicants: [
      {
        id: null,
        contactId: null,
        name: o.applicantName,
        email: o.applicantEmail,
        phone: null,
        isPrimary: true,
        dob: null,
        incomePerYear: 36000,
        employmentRex: "Employed",
        guarantorCount: 0,
        keyInfo: null,
      },
    ],
    createdBy: "Test file",
    createdAt: new Date(o.received).getTime(),
    rightToRentIncomplete: false,
  };
}

async function offerContext(o: TestOffer): Promise<{ l: TestListing | null; d: TestDeal | null }> {
  const [l, d] = await Promise.all([
    testListing(o.listingId),
    rows<TestDeal>("deal", "payload->>'appId' = $2", [o.appId]).then((r) => r[0]?.payload ?? null),
  ]);
  return { l, d };
}

/** The tester's own test offers, as the Applications board draws them. */
export async function testApplicationsFor(email: string | null | undefined): Promise<Application[]> {
  if (!email) return [];
  const os = await rows<TestOffer>("offer", "owner_email = LOWER($2)", [email]);
  return Promise.all(os.map(async (r) => {
    const { l, d } = await offerContext(r.payload);
    return toApplication(r.payload, l, d);
  }));
}

export async function testApplication(appId: string): Promise<{ app: Application; deal: TestDeal | null } | null> {
  const r = await rows<TestOffer>("offer", "payload->>'appId' = $2", [appId]);
  if (!r[0]) return null;
  const { l, d } = await offerContext(r[0].payload);
  return { app: toApplication(r[0].payload, l, d), deal: d };
}

/** Offers on a test landlord file's listing, as Applications - the portal maps them itself. */
export async function testOffersForAppraisal(appraisalId: string): Promise<Application[]> {
  const os = await rows<TestOffer>("offer", "payload->>'appraisalId' = $2", [appraisalId]);
  return Promise.all(os.map(async (r) => {
    const { l, d } = await offerContext(r.payload);
    return toApplication(r.payload, l, d);
  }));
}

/* ── deals, and where they are ───────────────────────────────────────── */

export async function testDealForAppraisal(appraisalId: string): Promise<TestDeal | null> {
  const r = await rows<TestDeal>("deal", "payload->>'appraisalId' = $2", [appraisalId]);
  return r[0]?.payload ?? null;
}

export async function testDealsForTenant(email: string): Promise<TestDeal[]> {
  const r = await rows<TestDeal>("deal", "LOWER(payload->>'tenantEmail') = LOWER($2)", [email]);
  return r.map((x) => x.payload);
}

/** The latest test viewing and offer for a tenant, for the portal before a deal. */
export async function testViewingForTenant(email: string): Promise<TestViewing | null> {
  const r = await rows<TestViewing>("viewing", "LOWER(payload->>'tenantEmail') = LOWER($2)", [email]);
  return r[0]?.payload ?? null;
}

export async function testOfferForTenant(email: string): Promise<TestOffer | null> {
  const r = await rows<TestOffer>("offer", "LOWER(payload->>'applicantEmail') = LOWER($2)", [email]);
  return r[0]?.payload ?? null;
}

/** Stages in order, with each one's state, for a deal at `stageKey`. */
export function stagesAt(stageKey: string) {
  const idx = Math.max(0, PORTAL_STAGES.findIndex((s) => s.key === stageKey));
  return PORTAL_STAGES.map((s, i) => ({ key: s.key, label: s.label, state: (i < idx ? "done" : i === idx ? "current" : "upcoming") as "done" | "current" | "upcoming" }));
}

/**
 * A test application's spine, in the shape journeyFor() gives a real one:
 * REX's three stops, then Kirstie's eight at the deal's stage. Nothing is
 * asked of Propoly, the handover or the PLC store - the deal is the record.
 */
export function testJourney(app: Application, deal: TestDeal | null): ApplicationJourney {
  const accepted = app.status === "accepted";
  const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null);
  const stops: JourneyStop[] = [
    { id: "received", label: "Received", sub: `Came in ${day(app.dateReceived) ?? ""}`.trim(), tone: "ok", state: "done" },
    {
      id: "decision",
      label: "Landlord decision",
      sub: accepted ? `Accepted ${day(app.dateAccepted) ?? ""}`.trim() : "Not yet put to the landlord",
      tone: accepted ? "ok" : "none",
      state: accepted ? "done" : "current",
    },
    {
      id: "handover",
      label: "Handover",
      sub: deal ? "Test deal - handed over" : null,
      tone: deal ? "ok" : "none",
      state: deal ? "done" : accepted ? "current" : "upcoming",
    },
  ];
  const at = deal ? stagesAt(deal.stageKey) : null;
  PORTAL_STAGES.forEach((s, i) => {
    stops.push({ id: s.key, label: s.label, sub: null, tone: "none", state: at ? at[i].state : "upcoming" });
  });
  const actions: JourneyAction[] = accepted
    ? []
    : [{ id: "test-decision", label: "Put the offer to the landlord", detail: "This is a test offer - move the test file on from Admin > Testing to accept it.", href: null, who: "you" }];
  return {
    stops,
    actions,
    flags: [],
    deal: deal ? { id: `test-${deal.appId}`, stage: deal.stageKey, url: "" } : null,
    plc: null,
    handover: null,
    history: [],
  };
}

/**
 * A viewing booked on a TEST listing (James, 20 Sep 2026: "hook the two up so
 * I can book a test viewing into that property").
 *
 * It goes in the tester's own diary (os_appointments, the same row a real
 * booking makes) and onto the test file, so the listing's Viewings tab, the
 * landlord's portal and the tenant's all show it. Nothing reaches Outlook,
 * REX or the applicant - the caller skips those for a test id.
 *
 * The appointment id is written onto the kit as well, so resetting or
 * deleting the file takes the diary entry with it (lib/test-files unwind).
 */
export async function addTestViewing(p: {
  listingId: number;
  startsAt: string;
  mins: number;
  who: string;
  tenantEmail: string;
  withName: string;
  authorId: string | null;
  authorName: string;
}): Promise<{ appointmentId: string; listing: TestListing } | null> {
  if (!hasDb()) return null;
  const rows = await q<{ kit_id: string; owner_email: string; payload: TestListing }>(
    `SELECT kit_id, owner_email, payload FROM os_test_records WHERE kind = 'listing' AND (payload->>'listingId')::bigint = $1 LIMIT 1`,
    [p.listingId]
  ).catch(() => []);
  const row = rows[0];
  if (!row) return null;

  const id = randomUUID();
  const where = `${row.payload.name}, ${row.payload.locality} ${row.payload.postcode}`.trim();
  await q(
    `INSERT INTO os_appointments (id, starts_at, mins, kind, title, where_at, who, author_id, author_name) VALUES ($1,$2,$3,'viewing',$4,$5,$6,$7,$8)`,
    [id, new Date(p.startsAt).toISOString(), p.mins, `Viewing: ${row.payload.name} (test)`, where, p.who.slice(0, 120), p.authorId, p.authorName]
  );
  const v: TestViewing = {
    appointmentId: id,
    listingId: p.listingId,
    tenantEmail: p.tenantEmail,
    startsAt: new Date(p.startsAt).toISOString(),
    withName: p.withName,
    done: new Date(p.startsAt).getTime() < Date.now(),
  };
  await putTestRecord(row.kit_id, row.owner_email, "viewing", v);
  /* Onto the kit, so a reset or a delete takes the diary entry with it. */
  await q(
    `UPDATE os_test_kits
        SET refs = jsonb_set(COALESCE(refs, '{}'::jsonb), '{appointments}', COALESCE(refs->'appointments', '[]'::jsonb) || to_jsonb($2::text))
      WHERE id = $1`,
    [row.kit_id, id]
  ).catch(() => null);
  return { appointmentId: id, listing: row.payload };
}
