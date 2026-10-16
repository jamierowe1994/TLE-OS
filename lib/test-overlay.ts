import "server-only";
import { randomUUID } from "node:crypto";
import { hasDb, q } from "@/lib/db";
import { PORTAL_STAGES } from "@/lib/business/propoly-stages";
import type { OsListing } from "@/lib/rex-listings";
import type { Application } from "@/lib/applications";
import type { ManagedProperty } from "@/lib/portfolio-types";
import { caseIdFor, PLC_STATES, type PlcCase } from "@/lib/plc";
import { getCase } from "@/lib/plc-store";
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
  /** The phone is carried from 13 Oct 2026; older rows are looked up on the
   *  file's landlord contact (lib/test-listing-answers testLandlord). */
  landlord: { name: string; email: string; phone?: string | null };
  /**
   * Draft or live (James, 13 Oct 2026: a tester walks a listing from New
   * listing to Push to the portals, so a test listing has to be able to be a
   * draft first). Missing means published: every row written before this,
   * by a reset's marketStages, is on the market and stays there.
   */
  status?: "draft" | "published";
  /** When it was made, for a draft's age. Older rows use publishedAt. */
  createdAt?: string;
  availableFrom?: string | null;
  deposit?: number | null;
};

/** An enquiry on a test listing, as the listing's Enquiries tab draws one. */
export type TestEnquiry = {
  id: string;
  listingId: number;
  name: string;
  email: string;
  phone: string;
  message: string;
  source: string;
  receivedAt: string;
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
  /** Who put it forward (13 Oct 2026). Older rows fall back to the tester. */
  agentName?: string | null;
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
  /** When the tester pressed the real Push to Propoly on it (13 Oct 2026). A
   *  deal from before then that is already past "deal started" counts as pushed. */
  pushedAt?: string | null;
  /** The home it became on move day: an os_properties row, pm-test-<kit>. */
  homeId?: string | null;
};

export type TestViewing = {
  appointmentId: string;
  listingId: number;
  tenantEmail: string;
  startsAt: string;
  withName: string;
  done: boolean;
};

type Kind = "listing" | "offer" | "deal" | "viewing" | "enquiry";
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

/**
 * The tester's own rows, or rows on a file that names them in its `viewers`
 * (5 Oct 2026: James sees the files he asked to be made for Howard). The
 * email is $2.
 */
const MINE = "(owner_email = LOWER($2) OR kit_id IN (SELECT id FROM os_test_kits WHERE cleared_at IS NULL AND refs->'viewers' ? LOWER($2)))";

async function rows<T>(kind: Kind, where: string, params: unknown[]): Promise<Row<T>[]> {
  if (!hasDb()) return [];
  return q<Row<T>>(`SELECT id, kit_id, owner_email, payload FROM os_test_records WHERE kind = $1 AND ${where} ORDER BY created_at DESC`, [kind, ...params]).catch(() => []);
}

/* ── listings ────────────────────────────────────────────────────────── */

export const isDraftTest = (l: Pick<TestListing, "status">): boolean => l.status === "draft";

function toOsListing(l: TestListing): OsListing {
  const draft = isDraftTest(l);
  return {
    id: String(l.listingId),
    propertyId: null,
    name: l.name,
    locality: `${l.locality} ${l.postcode}`.trim(),
    rent: l.rent,
    rentPeriod: "month",
    rentMonthly: l.rent,
    letAgreed: false,
    /* A draft reads as one everywhere the book is read (the board's live
       views, the Push to the portals button) until it is pushed. */
    publicationStatus: draft ? "draft" : "published",
    availableFrom: l.availableFrom ?? null,
    epcExpiry: null,
    epcRating: "C",
    daysOnMarket: draft ? null : Math.max(0, Math.floor((Date.now() - new Date(l.publishedAt).getTime()) / 86400000)),
    publishedAt: draft ? null : l.publishedAt.slice(0, 10),
    createdAt: (l.createdAt ?? l.publishedAt).slice(0, 10),
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
    rows<TestListing>("listing", MINE, [email]),
    rows<TestDeal>("deal", MINE, [email]),
  ]);
  const agreed = new Set(deals.map((d) => d.payload.listingId));
  return ls.map((r) => ({ ...toOsListing(r.payload), letAgreed: agreed.has(r.payload.listingId) }));
}

export async function testListing(listingId: number | string): Promise<TestListing | null> {
  const r = await rows<TestListing>("listing", "(payload->>'listingId')::bigint = $2", [Number(listingId)]);
  return r[0]?.payload ?? null;
}

/**
 * The test file's own people on a test listing (James, 13 Oct 2026: the E2E
 * walk). The kit's landlord and tenant contacts are OS contacts flagged
 * is_test, and every one of them carries the TESTER's email - so an email
 * alone can never tell Landlord E2E from Tenant E2E from last week's test
 * tenant. This is the file the listing was made on, read by its kit.
 */
export type KitPerson = { id: string; name: string; email: string; mobile: string; kind: string };
export async function kitPeopleForTestListing(listingId: number | string): Promise<KitPerson[]> {
  if (!hasDb()) return [];
  return q<KitPerson>(
    `SELECT c.id::text AS id, c.name, COALESCE(c.email, '') AS email, COALESCE(c.mobile, '') AS mobile, c.kind
       FROM os_test_records t
       JOIN os_test_kits k ON k.id = t.kit_id AND k.cleared_at IS NULL
       JOIN os_contacts c ON k.refs->'contacts' ? c.id::text
      WHERE t.kind = 'listing' AND (t.payload->>'listingId')::bigint = $1 AND c.is_test
      ORDER BY c.created_at ASC`,
    [Number(listingId)]
  ).catch(() => []);
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

/**
 * Has the tester pressed Push to Propoly on this deal? (13 Oct 2026.) A deal
 * already moved past "deal started" before the push was a button counts as
 * pushed, so no file walked before today is sent back a step.
 */
export function testDealPushed(d: TestDeal | null | undefined): boolean {
  if (!d) return false;
  return Boolean(d.pushedAt) || PORTAL_STAGES.findIndex((s) => s.key === d.stageKey) > 0;
}

function toApplication(o: TestOffer, l: TestListing | null, deal: TestDeal | null, tester: string | null = null): Application {
  return {
    id: o.appId,
    status: o.status,
    statusLabel: o.status === "accepted" ? "Accepted" : o.status === "unsuccessful" ? "Unsuccessful" : "Received",
    /* Accepted and not pushed yet reads as a real one does on the board
       (lib/application-journey stageLabels): "Handover due", which puts it
       under the board's To Hand Over tab until the push. */
    stageLabel: o.status === "accepted" && !testDealPushed(deal) ? "Handover due" : stageLabelOf(deal?.stageKey),
    closed: null,
    listingId: o.listingId,
    propertyId: null,
    property: l?.name ?? "Test listing",
    locality: l ? `${l.locality} ${l.postcode}`.trim() : "",
    image: l?.images[0] ?? null,
    /* Before the deal there was no agent at all, so the file said "—" (James,
       13 Oct 2026, the E2E walk): the one who put the offer forward, else the
       tester whose file it is. */
    agent: deal?.agentName || o.agentName || tester || null,
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
    updatedAt: null,
    rightToRentIncomplete: false,
  };
}

async function offerContext(o: TestOffer, kitId: string | null = null): Promise<{ l: TestListing | null; d: TestDeal | null; tester: string | null }> {
  const [l, d, plc, kit] = await Promise.all([
    testListing(o.listingId),
    rows<TestDeal>("deal", "payload->>'appId' = $2", [o.appId]).then((r) => r[0]?.payload ?? null),
    q<{ state: PlcCase["state"] }>(`SELECT state FROM os_plc_cases WHERE id = $1`, [caseIdFor(o.appId)]).then((r) => r[0] ?? null).catch(() => null),
    kitId && !o.agentName
      ? q<{ by_name: string | null }>(`SELECT by_name FROM os_test_kits WHERE id = $1`, [kitId]).then((r) => r[0] ?? null).catch(() => null)
      : Promise.resolve(null),
  ]);
  /* Where the deal really is, PLC pack included, so the board's label and
     the file's spine say the same thing. */
  return { l, d: d ? { ...d, stageKey: testDealStage(d, plc) } : null, tester: kit?.by_name?.trim() || null };
}

/** The tester's own test offers, as the Applications board draws them. */
export async function testApplicationsFor(email: string | null | undefined): Promise<Application[]> {
  if (!email) return [];
  const os = await rows<TestOffer>("offer", MINE, [email]);
  return Promise.all(os.map(async (r) => {
    const { l, d, tester } = await offerContext(r.payload, r.kit_id);
    return toApplication(r.payload, l, d, tester);
  }));
}

export async function testApplication(appId: string): Promise<{ app: Application; deal: TestDeal | null } | null> {
  const r = await rows<TestOffer>("offer", "payload->>'appId' = $2", [appId]);
  if (!r[0]) return null;
  const { l, d, tester } = await offerContext(r[0].payload, r[0].kit_id);
  return { app: toApplication(r[0].payload, l, d, tester), deal: d };
}

/** Offers on a test landlord file's listing, as Applications - the portal maps them itself. */
export async function testOffersForAppraisal(appraisalId: string): Promise<Application[]> {
  const os = await rows<TestOffer>("offer", "payload->>'appraisalId' = $2", [appraisalId]);
  return Promise.all(os.map(async (r) => {
    const { l, d, tester } = await offerContext(r.payload, r.kit_id);
    return toApplication(r.payload, l, d, tester);
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

/** All of them, newest first - their record shows everywhere they have been. */
export async function testViewingsForTenant(email: string): Promise<TestViewing[]> {
  const r = await rows<TestViewing>("viewing", "LOWER(payload->>'tenantEmail') = LOWER($2)", [email]);
  return r.map((x) => x.payload).sort((a, b) => b.startsAt.localeCompare(a.startsAt));
}

export async function testOfferForTenant(email: string): Promise<TestOffer | null> {
  const r = await rows<TestOffer>("offer", "LOWER(payload->>'applicantEmail') = LOWER($2)", [email]);
  return r[0]?.payload ?? null;
}

/**
 * The tester's own test lets once pushed, for the agent's board of lets
 * (James, 13 Oct 2026: an accepted test let moves across the Applications
 * board as its deal moves on). Each with where it really is, PLC pack
 * included, and the pack itself for the card. Not pushed yet, a let is under
 * the board's To Hand Over tab instead (its stageLabel says "Handover due").
 */
export async function testDealsForBoard(email: string | null | undefined): Promise<{ deal: TestDeal; stageKey: string; plc: PlcCase | null; listing: TestListing | null; offer: TestOffer | null }[]> {
  if (!email) return [];
  const [ds, os] = await Promise.all([rows<TestDeal>("deal", MINE, [email]), rows<TestOffer>("offer", MINE, [email])]);
  const out = [];
  for (const r of ds) {
    const d = r.payload;
    if (!testDealPushed(d)) continue;
    const [plc, listing] = await Promise.all([
      getCase(caseIdFor(d.appId)).catch(() => null),
      testListing(d.listingId).catch(() => null),
    ]);
    const offer = os.find((o) => o.payload.appId === d.appId)?.payload ?? null;
    if (offer?.status === "unsuccessful") continue;
    out.push({ deal: d, stageKey: testDealStage(d, plc), plc, listing, offer });
  }
  return out;
}

/** The landlord behind a test tenancy, for a job raised by its tenant. */
export async function landlordForTestDeal(dealId: string): Promise<{ name: string; email: string } | null> {
  const id = dealId.startsWith("test-") ? dealId.slice(5) : dealId;
  const d = await rows<TestDeal>("deal", "payload->>'appId' = $2", [id]).then((r) => r[0]?.payload ?? null);
  if (!d) return null;
  const l = await testListing(d.listingId);
  return l ? l.landlord : null;
}

/** The OS property a test tenancy's home is held as, for a job its tenant reports. */
export async function propertyForTestDeal(dealId: string): Promise<{ id: string; name: string } | null> {
  if (!hasDb()) return null;
  const id = dealId.startsWith("test-") ? dealId.slice(5) : dealId;
  const r = await q<{ pid: string; name: string }>(
    `SELECT k.refs->>'osPropertyId' AS pid, p.name
       FROM os_test_records t JOIN os_test_kits k ON k.id = t.kit_id
       JOIN os_properties p ON p.id = k.refs->>'osPropertyId'
      WHERE t.kind = 'deal' AND t.payload->>'appId' = $1 AND k.cleared_at IS NULL LIMIT 1`,
    [id]
  ).catch(() => []);
  return r[0]?.pid ? { id: r[0].pid, name: r[0].name } : null;
}

/* ── the managed book ────────────────────────────────────────────────── */

/**
 * The tester's own live-tenancy homes, as Portfolio draws them (James, 5 Oct
 * 2026: "a dummy property on there so I can start receiving tickets").
 *
 * The home is an os_properties row (source 'test'), but the managed book is
 * REX PM's list since 2 Oct, so it never reaches the book on its own - and must
 * not, or every figure on the page would carry it. It is added at serve time,
 * only for the tester who made it (or a person named in the kit's `viewers`),
 * and is never counted: Portfolio leaves `test` rows out of every total.
 */
export async function testHomesFor(email: string | null | undefined): Promise<ManagedProperty[]> {
  if (!email || !hasDb()) return [];
  const kits = await q<{ id: string; refs: { contacts?: string[]; osPropertyId?: string }; by_name: string | null }>(
    `SELECT id, refs, by_name FROM os_test_kits
      WHERE cleared_at IS NULL AND refs ? 'osPropertyId'
        AND (created_by = LOWER($1) OR refs->'viewers' ? LOWER($1))
      ORDER BY created_at DESC`,
    [email]
  ).catch(() => []);
  const out: ManagedProperty[] = [];
  for (const k of kits) {
    const pid = k.refs.osPropertyId!;
    const [prop, recs] = await Promise.all([
      q<{ name: string; address: string; locality: string; postcode: string | null; town: string | null }>(
        `SELECT name, address, locality, postcode, town FROM os_properties WHERE id = $1 AND active`,
        [pid]
      ).catch(() => []),
      q<{ kind: Kind; payload: TestListing & TestDeal }>(`SELECT kind, payload FROM os_test_records WHERE kit_id = $1 ORDER BY created_at DESC`, [k.id]).catch(() => []),
    ]);
    const home = prop[0];
    if (!home) continue;
    const deals = recs.filter((r) => r.kind === "deal").map((r) => r.payload as TestDeal);
    /* The deal that became this home (advanceTestDeal), else the one at move day, else the newest. */
    const deal = deals.find((d) => d.homeId === pid) ?? deals.find((d) => d.stageKey === "move_day") ?? deals[0] ?? null;
    const own = recs.find((r) => r.kind === "listing" && (!deal || (r.payload as TestListing).listingId === deal.listingId))?.payload as TestListing | undefined;
    /* The listing can sit on another file (a tenant file's offer on a landlord
       file's listing): read it, and its file, where it is. */
    const elsewhere = !own && deal
      ? (await q<{ kit_id: string; payload: TestListing }>(`SELECT kit_id, payload FROM os_test_records WHERE kind = 'listing' AND (payload->>'listingId')::bigint = $1 LIMIT 1`, [deal.listingId]).catch(() => []))[0] ?? null
      : null;
    const listing = own ?? elsewhere?.payload ?? (recs.find((r) => r.kind === "listing")?.payload as TestListing | undefined) ?? null;
    const listingKit = elsewhere?.kit_id ?? k.id;

    /* WHO IS WHO (13 Oct 2026). This read contacts[0] as the landlord and
       contacts[1] as the tenant, which is only true of the live-tenancy kit.
       A file may hold its two people in either order, or only one of them,
       and the tenant may be on another file altogether. So: the landlord is
       the landlord contact on the listing's file, and the tenant is the
       deal's tenant - a test tenant contact with the deal's email, on this
       file first, then on any open test file. */
    const kitContacts = listingKit === k.id
      ? k.refs.contacts ?? []
      : (await q<{ contacts: string[] | null }>(`SELECT refs->'contacts' AS contacts FROM os_test_kits WHERE id = $1`, [listingKit]).catch(() => []))[0]?.contacts ?? [];
    const [onFile, tenantRow] = await Promise.all([
      q<{ id: string; kind: string; mobile: string | null }>(`SELECT id, kind, mobile FROM os_contacts WHERE id = ANY($1)`, [[...new Set([...kitContacts, ...(k.refs.contacts ?? [])])]]).catch(() => []),
      deal?.tenantEmail
        ? q<{ id: string; mobile: string | null }>(
            `SELECT c.id, c.mobile FROM os_contacts c
              WHERE c.is_test AND c.kind = 'tenant' AND LOWER(c.email) = LOWER($1)
                AND EXISTS (SELECT 1 FROM os_test_kits t WHERE t.cleared_at IS NULL AND t.refs->'contacts' ? c.id)
              ORDER BY (c.id = ANY($2)) DESC, c.created_at DESC LIMIT 1`,
            [deal.tenantEmail, k.refs.contacts ?? []]
          ).catch(() => [])
        : Promise.resolve([] as { id: string; mobile: string | null }[]),
    ]);
    const landlordRow = onFile.find((c) => c.kind === "landlord" && kitContacts.includes(c.id)) ?? onFile.find((c) => c.kind === "landlord") ?? null;
    const tenantFound = tenantRow[0] ?? onFile.find((c) => c.kind === "tenant") ?? null;
    const landlordId = landlordRow?.id ?? k.refs.contacts?.[0];
    const tenantId = tenantFound?.id ?? k.refs.contacts?.[1];
    const people = [...onFile, ...tenantRow];
    const phone = (id: string | undefined) => people.find((c) => c.id === id)?.mobile?.trim() || null;
    const rent = deal?.rent ?? listing?.rent ?? null;
    out.push({
      listingId: pid,
      propertyId: pid,
      name: home.name,
      locality: home.locality ? `${home.locality} ${home.postcode ?? ""}`.trim() : home.postcode ?? "",
      address: home.address,
      town: home.town,
      postcode: home.postcode,
      lat: null,
      lng: null,
      rent,
      rentPeriod: rent ? "month" : null,
      rentMonthly: rent,
      service: "Managed",
      letType: "Long Term",
      letSince: deal?.moveIn ?? null,
      onBooksSince: listing?.publishedAt?.slice(0, 10) ?? null,
      agent: deal ? { id: "", name: deal.agentName } : null,
      landlord: listing ? { contactId: landlordId ?? "", name: listing.landlord.name, email: listing.landlord.email, phone: phone(landlordId) } : null,
      tenants: deal ? [{ contactId: tenantId ?? "", name: deal.tenantName, email: deal.tenantEmail, phone: phone(tenantId) }] : [],
      image: listing?.images[0] ?? null,
      images: listing?.images ?? [],
      epcExpiry: null,
      epcRating: null,
      onRex: false,
      rexLet: false,
      test: true,
    });
  }
  return out;
}

/** Stages in order, with each one's state, for a deal at `stageKey`. */
export function stagesAt(stageKey: string) {
  const idx = Math.max(0, PORTAL_STAGES.findIndex((s) => s.key === stageKey));
  return PORTAL_STAGES.map((s, i) => ({ key: s.key, label: s.label, state: (i < idx ? "done" : i === idx ? "current" : "upcoming") as "done" | "current" | "upcoming" }));
}

/**
 * Where a test deal is, once its PLC pack is taken into account: a pack sent
 * puts the deal at the PLC stop, and an approved one past it - the same rule
 * Kirstie's board applies to a real deal (derivePortalStage).
 */
export function testDealStage(deal: TestDeal, plc: Pick<PlcCase, "state"> | null): string {
  const at = PORTAL_STAGES.findIndex((s) => s.key === deal.stageKey);
  const plcAt = PORTAL_STAGES.findIndex((s) => s.key === "plc");
  if (plc?.state === "approved" && at <= plcAt) return PORTAL_STAGES[plcAt + 1].key;
  if (plc && plc.state !== "assembling" && at < plcAt) return "plc";
  return deal.stageKey;
}

/** What each stage's "move on" button says on a test deal, in the words of the step it stands for. */
const ADVANCE_WORDS: Record<string, { label: string; detail: string }> = {
  holding_fee: { label: "Mark the holding fee paid", detail: "On a real let the tenant pays it through Propoly." },
  referencing: { label: "Mark the references passed", detail: "On a real let the referencing comes back in Propoly." },
  deposit: { label: "Mark the deposit registered", detail: "On a real let the deposit is taken and registered, or Flatfair is set up." },
  tenancy_agreement: { label: "Mark the agreement signed", detail: "On a real let everybody signs it in Propoly." },
  rent_payment: { label: "Mark the first rent received", detail: "On a real let the move-in monies arrive in PayProp." },
};

/**
 * A test application's spine, in the shape journeyFor() gives a real one:
 * REX's three stops, then Kirstie's eight at the deal's stage.
 *
 * WALKABLE (James, 5 Oct 2026: "run through applications and show Howard
 * everything he needs to go through ... and the PLC checks"). The steps a
 * real application takes in REX or Propoly - the agent accepting it, Kirstie
 * moving the deal on - are buttons here (`test`), played by the tester. The
 * PLC check is the REAL one: its own pack (plc-<app id>), its own screens,
 * Kirstie's queue - only nothing about it leaves the OS (lib/test-guard
 * isTestCase).
 */
export function testJourney(app: Application, deal: TestDeal | null, plc: PlcCase | null = null): ApplicationJourney {
  const accepted = app.status === "accepted";
  const pushed = testDealPushed(deal);
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
      sub: pushed ? "Test deal - pushed (nothing left the OS)" : accepted ? "Push it to Propoly" : null,
      tone: pushed ? "ok" : "none",
      state: pushed ? "done" : accepted ? "current" : "upcoming",
    },
  ];
  const stageKey = deal ? testDealStage(deal, plc) : null;
  const at = stageKey ? stagesAt(stageKey) : null;
  const plcState = plc ? PLC_STATES.find((x) => x.id === plc.state) : null;
  PORTAL_STAGES.forEach((s, i) => {
    const isPlc = s.key === "plc" && plc;
    stops.push({
      id: s.key,
      label: s.label,
      sub: isPlc ? (plcState ? `${plcState.label} · ${plcState.who}` : plc!.state) : null,
      tone: isPlc ? (plc!.state === "approved" ? "ok" : plc!.state === "declined" ? "warn" : "none") : "none",
      state: at ? at[i].state : "upcoming",
    });
  });

  const actions: JourneyAction[] = [];
  const plcHref = `/plc/start?application=${encodeURIComponent(app.id)}`;
  if (!accepted) {
    actions.push({
      id: "test-landlord",
      label: "The landlord approves it in their portal",
      detail: "Sign in to the landlord portal as the test landlord and press Approve on this offer. It emails you, as a real approval does.",
      href: null,
      who: "landlord",
    });
    actions.push({
      id: "test-accept",
      label: "Accept the offer",
      detail: "On a real application you accept it once the landlord has said yes. On this test one, press it to do that and start the deal.",
      href: null,
      who: "you",
      test: "accept",
    });
    /* An agent can turn an offer down as well (James, 7 Oct 2026), not only
       the landlord. */
    actions.push({
      id: "test-decline",
      label: "Decline the offer",
      detail: "Turn this offer down. It stays on the listing as declined and the home keeps taking viewings and offers. The tenant isn't told automatically.",
      href: null,
      who: "you",
      test: "decline",
    });
  } else if (deal && !pushed) {
    /* THE REAL BUTTON (James, 13 Oct 2026: walk a test file through the real
       screens "with nothing refusing or slowing them"). The Next Step card's
       Push to Propoly posts to /api/handoff as it does for a real let; for a
       test application that route plays the push (pushTestDeal) and nothing
       reaches Propoly or REX. The deal moves on to the holding fee. */
    actions.push({
      id: "handover",
      label: "Push to Propoly",
      detail: "Accepted. Push it to Propoly: the landlord, the home and the deal with its tenants go over. On this test file the push is played - nothing leaves the OS - and the deal moves on to the holding fee.",
      href: null,
      who: "you",
      push: true,
    });
  } else if (pushed) {
    /* The pack after the holding fee and referencing, as on a real let. */
    const refAt = PORTAL_STAGES.findIndex((s) => s.key === "referencing");
    const at = stageKey ? PORTAL_STAGES.findIndex((s) => s.key === stageKey) : -1;
    if (!plc) {
      if (at >= refAt) {
        actions.push({
          id: "plc-start",
          label: "Start the PLC check",
          detail: "The pre-let compliance pack has not been started for this let. On this test file, Send brings it straight back approved and the deal moves on to the deposit.",
          href: plcHref,
          who: "you",
        });
      }
    } else {
      const queries = plc.findings.filter((f) => f.level !== "ok");
      if (plc.state === "assembling") {
        actions.push({ id: "plc-submit", label: "Finish and submit the PLC pack", detail: "Started but not sent yet. On this test file, Send brings it straight back approved.", href: plcHref, who: "you" });
      } else if (plc.state === "deferred" && queries.length) {
        actions.push({ id: "plc-query", label: "Answer Kirstie on the PLC pack", detail: queries.map((f) => f.message).join(" "), href: plcHref, who: "you" });
      } else if (plc.state === "declined") {
        actions.push({ id: "plc-declined", label: "The PLC pack was declined", detail: plc.decisionNote || "See Kirstie's note on the pack.", href: plcHref, who: "you" });
      } else if (plc.state !== "approved") {
        actions.push({
          id: "plc-wait",
          label: "Check and approve the PLC pack, as Kirstie",
          detail: `With compliance (${plcState?.label ?? plc.state}). On a real pack this is Kirstie's; on a test one you play her part on the PLC queue - the first check, then the approval.`,
          href: `/pre-tenancy/plc?case=${encodeURIComponent(plc.id)}`,
          who: "you",
        });
      }
    }
  }
  /* Moving the deal on: Kirstie's job on a real deal, the tester's here. Never
     past the PLC stop until the pack is approved - that is the check's whole
     point, and the button would teach the opposite. Not before the push
     either: the push is what starts the deal. From referencing the PLC pack
     leads, and sending it moves the deal on, so the button is a reminder
     there rather than the next step. */
  if (deal && stageKey && pushed) {
    const idx = PORTAL_STAGES.findIndex((s) => s.key === stageKey);
    const next = PORTAL_STAGES[idx + 1];
    const plcAt = PORTAL_STAGES.findIndex((s) => s.key === "plc");
    /* At the PLC stop means the pack is not approved yet (testDealStage moves an approved one past it). */
    if (next && idx !== plcAt) {
      const words = ADVANCE_WORDS[stageKey];
      actions.push({
        id: "test-advance",
        label: words?.label ?? `Move the deal on to ${next.label}`,
        detail: `${words?.detail ?? "On a real deal this happens as each step is done."} On this test one, press it and the deal moves on to ${next.label}.`,
        href: null,
        who: "you",
        test: "advance",
        ...(next.key === "plc" ? { minor: true } : {}),
      });
    }
    /* Moved in: the home is on Portfolio now (advanceTestDeal made it). */
    if (!next && deal.homeId) {
      actions.push({
        id: "test-home",
        label: "See the home on Portfolio",
        detail: "Moved in. The home is on Portfolio now with its landlord and tenant - only for you, and never counted in the figures.",
        href: `/portfolio/${encodeURIComponent(deal.homeId)}`,
        who: "you",
      });
    }
  }
  return {
    stops,
    actions,
    flags: [],
    deal: deal ? { id: `test-${deal.appId}`, stage: stageKey ?? deal.stageKey, url: "" } : null,
    plc: plc ? { id: plc.id, state: plc.state, who: plcState?.who ?? "" } : null,
    handover: null,
    /* A test let is "in Propoly" once its pretend push has run; there is no real deal to open. */
    inPropoly: deal && testDealPushed(deal) ? { url: null, how: "pushed" } : null,
    history: [],
  };
}

/** May this person press a test application's buttons? Its tester, or someone the file names. */
async function mayPlay(appId: string, email: string): Promise<{ kitId: string; owner: string } | null> {
  const r = await q<{ kit_id: string; owner_email: string }>(
    `SELECT t.kit_id, t.owner_email FROM os_test_records t JOIN os_test_kits k ON k.id = t.kit_id
      WHERE t.kind = 'offer' AND t.payload->>'appId' = $1 AND k.cleared_at IS NULL
        AND (t.owner_email = LOWER($2) OR k.refs->'viewers' ? LOWER($2) OR k.created_by = LOWER($2))
      LIMIT 1`,
    [appId, email]
  ).catch(() => []);
  return r[0] ? { kitId: r[0].kit_id, owner: r[0].owner_email } : null;
}

/** "Accept the offer" on a test application: accepted, and its deal started. */
export async function acceptTestOffer(appId: string, by: { name: string; email: string }, agreed?: { amount: number; moveIn: string | null } | null): Promise<void> {
  const who = await mayPlay(appId, by.email);
  if (!who) throw new Error("That test application isn't one of yours.");
  await q(
    `UPDATE os_test_records SET payload = payload || jsonb_build_object('status', 'accepted', 'accepted', $2::text)
      WHERE kind = 'offer' AND payload->>'appId' = $1`,
    [appId, new Date().toISOString()]
  );
  /* Accepted at a countered figure (16 Oct 2026, lib/offer-counters): the
     test offer says the agreed rent, so its deal does too. */
  if (agreed) {
    await q(
      `UPDATE os_test_records SET payload = payload
          || jsonb_build_object('offeredAmount', COALESCE(payload->'offeredAmount', payload->'amount'), 'amount', $2::numeric)
          || CASE WHEN $3::text IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('moveIn', $3::text) END
        WHERE kind = 'offer' AND payload->>'appId' = $1`,
      [appId, agreed.amount, agreed.moveIn]
    );
  }
  const t = await testApplication(appId);
  if (!t || t.deal) return;
  const l = await testListing(t.app.listingId ?? 0);
  const o = (await rows<TestOffer>("offer", "payload->>'appId' = $2", [appId]))[0]?.payload;
  if (!o) return;
  const deal: TestDeal = {
    appId,
    listingId: o.listingId,
    appraisalId: o.appraisalId,
    tenantName: o.applicantName,
    tenantEmail: o.applicantEmail,
    property: l?.name ?? t.app.property,
    locality: l ? `${l.locality} ${l.postcode}`.trim() : t.app.locality,
    rent: o.amount,
    moveIn: o.moveIn,
    stageKey: "deal_started",
    agentName: by.name || by.email,
    agentEmail: who.owner,
  };
  await putTestRecord(who.kitId, who.owner, "deal", deal);
}

/** "Decline the offer" on a test application: unsuccessful, and off the board. */
export async function declineTestOffer(appId: string, by: { email: string }): Promise<void> {
  if (!(await mayPlay(appId, by.email))) throw new Error("That test application isn't one of yours.");
  const t = await testApplication(appId);
  if (t?.deal) throw new Error("This one has a deal started, so it can't be declined from here.");
  await q(
    `UPDATE os_test_records SET payload = payload || jsonb_build_object('status', 'unsuccessful')
      WHERE kind = 'offer' AND payload->>'appId' = $1`,
    [appId]
  );
}

/**
 * An offer made on a TEST listing (7 Oct 2026, James: the Make an offer
 * button vanished on 14 Test Street). Filed on the listing's own test file,
 * the same row a test kit's "offer received" makes, so the landlord's portal,
 * Accept and Decline all treat it as they treat any test offer. Nothing
 * leaves the OS.
 */
export async function addTestOffer(p: {
  listingId: number;
  by: { email: string; name?: string | null };
  name: string;
  email: string;
  amount: number;
  moveIn: string;
  adults: number;
  children: number;
  pets: boolean;
}): Promise<string> {
  const r = await rows<TestListing>("listing", "(payload->>'listingId')::bigint = $2", [p.listingId]);
  const home = r[0];
  if (!home) throw new Error("That test listing isn't there any more.");
  const kit = await q<{ id: string }>(
    `SELECT id FROM os_test_kits WHERE id = $1 AND cleared_at IS NULL
        AND (created_by = LOWER($2) OR refs->'viewers' ? LOWER($2) OR $3 = LOWER($2))`,
    [home.kit_id, p.by.email, home.owner_email]
  ).catch(() => []);
  if (!kit[0]) throw new Error("That test listing isn't one of yours.");
  const appId = String(newTestId());
  const offer: TestOffer = {
    appId,
    listingId: p.listingId,
    appraisalId: home.payload.appraisalId,
    applicantName: p.name,
    applicantEmail: p.email.toLowerCase(),
    amount: p.amount,
    moveIn: p.moveIn,
    months: 0,
    adults: p.adults,
    children: p.children,
    pets: p.pets,
    status: "received",
    received: new Date().toISOString(),
    accepted: null,
    agentName: (p.by.name ?? "").trim() || null,
  };
  await putTestRecord(home.kit_id, home.owner_email, "offer", offer);
  return appId;
}

/** The offers on one test listing, newest first. */
export async function testOffersForListing(listingId: number): Promise<TestOffer[]> {
  const r = await rows<TestOffer>("offer", "(payload->>'listingId')::bigint = $2", [listingId]);
  return r.map((x) => x.payload);
}

/** "Move the deal on" on a test application: one stage, from where it really is. */
export async function advanceTestDeal(appId: string, by: { email: string }, plc: PlcCase | null): Promise<void> {
  if (!(await mayPlay(appId, by.email))) throw new Error("That test application isn't one of yours.");
  const row = (await rows<TestDeal>("deal", "payload->>'appId' = $2", [appId]))[0];
  const d = row?.payload;
  if (!d) throw new Error("Accept the offer first - there is no deal to move on yet.");
  if (!testDealPushed(d)) throw new Error("Push it to Propoly first - the push is what starts the deal.");
  const from = testDealStage(d, plc);
  const idx = PORTAL_STAGES.findIndex((s) => s.key === from);
  const plcAt = PORTAL_STAGES.findIndex((s) => s.key === "plc");
  if (idx === plcAt) throw new Error("The PLC pack has to be approved before the deal moves past it.");
  const next = PORTAL_STAGES[idx + 1];
  if (!next) throw new Error("The deal is already at its last stage.");
  await q(
    `UPDATE os_test_records SET payload = payload || jsonb_build_object('stageKey', $2::text) WHERE kind = 'deal' AND payload->>'appId' = $1`,
    [appId, next.key]
  );
  /* Move day: the tenant is in, so the home joins the managed book. */
  if (next.key === "move_day") await moveInTestHome(row.kit_id, d);
}

/**
 * "Push to Propoly" on a test application (James, 13 Oct 2026). The real
 * button on the Next Step card posts to /api/handoff, which comes here for a
 * test id before it asks REX or Propoly anything. Nothing leaves the OS: the
 * deal is marked pushed and moves on from "deal started" to the holding fee,
 * where a real deal goes once the push has started it.
 */
export async function pushTestDeal(appId: string, by: { email: string }): Promise<TestDeal> {
  if (!(await mayPlay(appId, by.email))) throw new Error("That test application isn't one of yours.");
  const t = await testApplication(appId);
  if (!t) throw new Error("That test application has gone.");
  if (t.app.status !== "accepted" || !t.deal) throw new Error("Accept the offer first. Only an accepted offer goes to Propoly.");
  if (!testDealPushed(t.deal)) {
    await q(
      `UPDATE os_test_records
          SET payload = payload || jsonb_build_object('pushedAt', $2::text, 'stageKey', CASE WHEN payload->>'stageKey' = 'deal_started' THEN 'holding_fee' ELSE payload->>'stageKey' END)
        WHERE kind = 'deal' AND payload->>'appId' = $1`,
      [appId, new Date().toISOString()]
    );
  }
  const after = await rows<TestDeal>("deal", "payload->>'appId' = $2", [appId]);
  return after[0]?.payload ?? t.deal;
}

/**
 * The home a test let becomes on move day (James, 13 Oct 2026: "the home
 * shows on Portfolio"). The same os_properties row the live-tenancy kit makes
 * (lib/test-files, source 'test', id pm-test-<kit>), on the kit the listing is
 * filed on, so a reset or a delete of that file takes it away again (unwind).
 * Portfolio adds it for the tester only and never counts it (testHomesFor).
 */
async function moveInTestHome(kitId: string, d: TestDeal): Promise<void> {
  const l = await testListing(d.listingId).catch(() => null);
  const name = l?.name ?? d.property;
  const locality = l?.locality ?? d.locality;
  const postcode = l?.postcode ?? "";
  const town = locality.split(",").map((x) => x.trim()).filter(Boolean).at(-1) ?? null;
  const id = `pm-test-${kitId}`;
  await q(
    `INSERT INTO os_properties (id, source, ref, address, name, locality, postcode, town, bedrooms, management, categories, hmo, no_gas, rex_property_id, match_how, active)
     VALUES ($1,'test',$2,$3,$4,$5,$6,$7,$8,'Active letting agreement','[]'::jsonb,FALSE,FALSE,NULL,'test file',TRUE)
     ON CONFLICT (id) DO UPDATE SET address = EXCLUDED.address, name = EXCLUDED.name, locality = EXCLUDED.locality, postcode = EXCLUDED.postcode, active = TRUE, updated_at = NOW()`,
    [id, `TEST-${kitId.slice(0, 6).toUpperCase()}`, [name, `${locality} ${postcode}`.trim()].filter(Boolean).join(", "), name, locality, postcode || null, town, l?.beds ?? 2]
  );
  await q(
    `UPDATE os_test_kits SET refs = jsonb_set(COALESCE(refs, '{}'::jsonb), '{osPropertyId}', to_jsonb($2::text)) WHERE id = $1`,
    [kitId, id]
  );
  await q(
    `UPDATE os_test_records SET payload = payload || jsonb_build_object('homeId', $2::text) WHERE kind = 'deal' AND payload->>'appId' = $1`,
    [d.appId, id]
  );
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
  /** The tenant's lead, so Change time and the confirmations know who it is. */
  leadId?: string | null;
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
    `INSERT INTO os_appointments (id, starts_at, mins, kind, title, where_at, who, author_id, author_name, booking) VALUES ($1,$2,$3,'viewing',$4,$5,$6,$7,$8,$9::jsonb)`,
    [id, new Date(p.startsAt).toISOString(), p.mins, `Viewing: ${row.payload.name} (test)`, where, p.who.slice(0, 120), p.authorId, p.authorName,
     /* What a real booking carries (app/api/viewings/book), so a test viewing
        can be moved and re-confirmed the same way (6 Oct 2026). */
     JSON.stringify({ leadId: p.leadId ?? null, listingId: String(p.listingId), applicantName: p.who, applicantEmail: p.tenantEmail || null, address: row.payload.name, startsAt: new Date(p.startsAt).toISOString(), minutes: p.mins })]
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

/* ── a test file's own listing: made as a draft, pushed, enquired on ───── */

/**
 * THE WALK FROM NEW LISTING TO THE PORTALS (James, 13 Oct 2026: a tester
 * walks the real screens end to end - "terms signed -> new listing -> Push
 * to the portals ... listing live on Listings -> viewings / enquiries /
 * offers" - without anything refusing or slowing them).
 *
 * New listing and Create the listing used to refuse a test file at REX's
 * door. Now they make the listing HERE, as a draft on the file's own kit;
 * Push to the portals turns it live here, with the real ceremony; and the
 * first enquiry lands on it, from the file's tenant when it has one. None of
 * it is REX's, a portal's or anybody's inbox.
 */

export type TestKitRef = { kitId: string; owner: string; refs: { contacts?: string[]; leadIds?: string[]; appraisals?: string[] } };

/**
 * The test file (os_test_kits) that holds this appraisal, lead or contact.
 * An appraisal booked from a lead is lead-<lead id>; a test lead is
 * os-<contact id>, so any one of the three finds the file.
 */
export async function kitFor(p: { appraisalId?: string | null; leadId?: string | null; contactId?: string | null }): Promise<TestKitRef | null> {
  if (!hasDb()) return null;
  const appraisalId = (p.appraisalId ?? "").trim();
  let leadId = (p.leadId ?? "").trim();
  if (!leadId && appraisalId.startsWith("lead-")) leadId = appraisalId.slice(5);
  let contactId = (p.contactId ?? "").trim();
  if (!contactId && leadId.startsWith("os-")) contactId = leadId.slice(3);
  if (!appraisalId && !leadId && !contactId) return null;
  const r = await q<{ id: string; created_by: string; refs: TestKitRef["refs"] | null }>(
    `SELECT id, created_by, refs FROM os_test_kits
      WHERE cleared_at IS NULL
        AND (($1 <> '' AND refs->'appraisals' ? $1) OR ($2 <> '' AND refs->'leadIds' ? $2) OR ($3 <> '' AND refs->'contacts' ? $3))
      ORDER BY created_at DESC LIMIT 1`,
    [appraisalId, leadId, contactId]
  ).catch(() => []);
  return r[0] ? { kitId: r[0].id, owner: r[0].created_by, refs: r[0].refs ?? {} } : null;
}

/**
 * A test file for a test landlord nobody made from Admin -> Testing: one
 * saved at the test address (POST /api/contacts flags them is_test and files
 * them here), or a test appraisal with no file. Written down as an ordinary
 * landlord file, so it shows
 * on the tester's Test files tab and Delete there takes all of it away.
 * Only ever ids that are themselves test: a contact still flagged is_test,
 * its os-<id> lead, and the appraisal the caller has already found is one.
 */
export async function adoptTestKit(p: { by: { email: string; name?: string | null }; contactId?: string | null; appraisalId?: string | null }): Promise<TestKitRef> {
  const email = p.by.email.trim().toLowerCase();
  const refs: TestKitRef["refs"] & { stage: string } = { stage: p.appraisalId ? "valued" : "new" };
  if (p.contactId) {
    const c = await q<{ id: string }>(`SELECT id FROM os_contacts WHERE id = $1 AND is_test`, [p.contactId]).catch(() => []);
    if (c[0]) {
      refs.contacts = [c[0].id];
      refs.leadIds = [`os-${c[0].id}`];
    }
  }
  if (p.appraisalId) refs.appraisals = [p.appraisalId];
  const id = randomUUID();
  await q(
    `INSERT INTO os_test_kits (id, kit, created_by, by_name, refs, links, said) VALUES ($1, $2, $3, $4, $5::jsonb, '[]'::jsonb, $6)`,
    [id, p.appraisalId ? "booked-appraisal" : "landlord-lead", email, p.by.name || email, JSON.stringify(refs), "A landlord saved at the test address, so a test file of its own. Kept out of REX; delete it here to clear everything on it."]
  );
  return { kitId: id, owner: email, refs };
}

/** Our own photographs, so a test advert passes the Photos check. */
const TEST_PHOTOS = ["/brand/photo/property.jpg", "/brand/photo/cover-terrace.webp", "/brand/photo/marketing.jpg", "/brand/photo/property-sample.webp"];

/**
 * A test listing, as a DRAFT, on the kit that owns the file. Filled in enough
 * to pass the portals' minimum (lib/listing-requirements) - photographs, a
 * headline, a description, an available date - because those are typed on
 * the Marketing tab, which a test listing shows but never saves.
 */
export async function makeTestListing(p: {
  kit: TestKitRef;
  appraisalId: string | null;
  home: string;
  postcode: string;
  rent: number;
  deposit?: number | null;
  availableFrom?: string | null;
  propertyType?: string | null;
  landlord: { name: string; email: string; phone?: string | null };
}): Promise<TestListing> {
  const listingId = newTestId();
  const postcode = p.postcode.trim().toUpperCase();
  const [first, ...rest] = p.home.split(",").map((x) => x.trim()).filter((x) => x && x.toUpperCase() !== postcode);
  const name = first || "Test home";
  const locality = rest.join(", ") || "Manchester";
  const now = new Date().toISOString();
  const available = p.availableFrom && /^\d{4}-\d{2}-\d{2}$/.test(p.availableFrom)
    ? p.availableFrom
    : new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const type = (p.propertyType ?? "").trim() || "Terraced house";
  const listing: TestListing = {
    listingId,
    appraisalId: p.appraisalId,
    name,
    locality,
    postcode,
    rent: Math.round(p.rent),
    beds: 2,
    baths: 1,
    propertyType: type,
    images: TEST_PHOTOS,
    heading: `${type}, ${name.replace(/^\d+[a-z]?\s+/i, "")}`,
    body: `A test advert for ${name}: two bedrooms, a newly fitted kitchen, a garden and gas central heating, close to the shops and the tram. Unfurnished. (A test listing - it never really goes on the portals.)`,
    publishedAt: now,
    portals: [
      { portal: "Rightmove", url: "https://www.rightmove.co.uk/" },
      { portal: "Zoopla", url: "https://www.zoopla.co.uk/" },
      { portal: "OnTheMarket", url: "https://www.onthemarket.com/" },
    ],
    landlord: { ...p.landlord, phone: (p.landlord.phone ?? "").trim() || null },
    status: "draft",
    createdAt: now,
    availableFrom: available,
    deposit: p.deposit ?? Math.round((p.rent * 12 * 5) / 52),
  };
  await putTestRecord(p.kit.kitId, p.kit.owner, "listing", listing);
  return listing;
}

/**
 * Push to the portals, on a test listing: it goes live here and nowhere else,
 * and the first enquiry lands on it so the Enquiries tab has something to
 * work. Its tester, anybody the file names, or an owner may press it.
 */
export async function publishTestListing(
  listingId: number,
  by: { email: string; role: string }
): Promise<{ ok: true; listing: TestListing } | { ok: false; status: number; error: string }> {
  if (!hasDb()) return { ok: false, status: 503, error: "There is no database here." };
  const found = await q<{ id: string; kit_id: string; owner_email: string; payload: TestListing; created_by: string | null; viewers: boolean | null }>(
    `SELECT t.id, t.kit_id, t.owner_email, t.payload, k.created_by, (k.refs->'viewers' ? LOWER($2)) AS viewers
       FROM os_test_records t LEFT JOIN os_test_kits k ON k.id = t.kit_id AND k.cleared_at IS NULL
      WHERE t.kind = 'listing' AND (t.payload->>'listingId')::bigint = $1
      LIMIT 1`,
    [listingId, by.email]
  ).catch(() => []);
  const row = found[0];
  if (!row || !row.created_by) return { ok: false, status: 404, error: "That test listing isn't there any more." };
  const me = by.email.trim().toLowerCase();
  const mine = row.owner_email === me || row.created_by === me || Boolean(row.viewers) || ["owner", "super_admin"].includes(by.role);
  if (!mine) return { ok: false, status: 403, error: "That test listing isn't one of yours." };
  if (!isDraftTest(row.payload)) return { ok: false, status: 409, error: "It is already published. Use Put back on the portals if it has been taken off." };

  const at = new Date().toISOString();
  await q(`UPDATE os_test_records SET payload = payload || jsonb_build_object('status', 'published', 'publishedAt', $2::text) WHERE id = $1`, [row.id, at]);
  await seedTestEnquiry(row.kit_id, row.owner_email, listingId).catch((e) => {
    console.error("[test-overlay] could not seed the test enquiry", (e as Error).message);
  });
  return { ok: true, listing: { ...row.payload, status: "published", publishedAt: at } };
}

/**
 * The first enquiry on a test listing, once it is live: from the file's own
 * test tenant when it has one (so their name opens their lead), else "Test
 * tenant", on the tester's own email - nothing is ever sent to it from here.
 */
async function seedTestEnquiry(kitId: string, owner: string, listingId: number): Promise<void> {
  const already = await rows<TestEnquiry>("enquiry", "(payload->>'listingId')::bigint = $2", [listingId]);
  if (already.length) return;
  const tenant = await q<{ id: string; name: string; mobile: string | null }>(
    `SELECT c.id, c.name, c.mobile
       FROM os_test_kits k
       JOIN os_contacts c ON k.refs->'contacts' ? c.id::text
      WHERE k.id = $1 AND c.is_test AND c.kind = 'tenant'
      ORDER BY c.created_at ASC LIMIT 1`,
    [kitId]
  ).catch(() => []);
  const t = tenant[0];
  const enquiry: TestEnquiry = {
    id: t ? `os-${t.id}` : `test-enquiry-${randomUUID()}`,
    listingId,
    name: t?.name ?? "Test tenant",
    email: owner,
    phone: t?.mobile?.trim() || "07700 900000",
    message: "Hello, is this still available? I'd like to book a viewing. (A test enquiry - it came from no portal.)",
    source: "Rightmove (test)",
    receivedAt: new Date().toISOString(),
  };
  await putTestRecord(kitId, owner, "enquiry", enquiry);
}

/** The enquiries on one test listing, for its tester (or anyone the file names), newest first. */
export async function testEnquiriesForListing(listingId: number, email: string | null | undefined): Promise<TestEnquiry[]> {
  if (!email) return [];
  const r = await rows<TestEnquiry>("enquiry", `${MINE} AND (payload->>'listingId')::bigint = $3`, [email, listingId]);
  return r.map((x) => x.payload);
}
