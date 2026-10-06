import "server-only";
import { randomUUID } from "node:crypto";
import { hasDb, q } from "@/lib/db";
import { PORTAL_STAGES } from "@/lib/business/propoly-stages";
import type { OsListing } from "@/lib/rex-listings";
import type { Application } from "@/lib/applications";
import type { ManagedProperty } from "@/lib/portfolio-types";
import { caseIdFor, PLC_STATES, type PlcCase } from "@/lib/plc";
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
    updatedAt: null,
    rightToRentIncomplete: false,
  };
}

async function offerContext(o: TestOffer): Promise<{ l: TestListing | null; d: TestDeal | null }> {
  const [l, d, plc] = await Promise.all([
    testListing(o.listingId),
    rows<TestDeal>("deal", "payload->>'appId' = $2", [o.appId]).then((r) => r[0]?.payload ?? null),
    q<{ state: PlcCase["state"] }>(`SELECT state FROM os_plc_cases WHERE id = $1`, [caseIdFor(o.appId)]).then((r) => r[0] ?? null).catch(() => null),
  ]);
  /* Where the deal really is, PLC pack included, so the board's label and
     the file's spine say the same thing. */
  return { l, d: d ? { ...d, stageKey: testDealStage(d, plc) } : null };
}

/** The tester's own test offers, as the Applications board draws them. */
export async function testApplicationsFor(email: string | null | undefined): Promise<Application[]> {
  if (!email) return [];
  const os = await rows<TestOffer>("offer", MINE, [email]);
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

/** All of them, newest first - their record shows everywhere they have been. */
export async function testViewingsForTenant(email: string): Promise<TestViewing[]> {
  const r = await rows<TestViewing>("viewing", "LOWER(payload->>'tenantEmail') = LOWER($2)", [email]);
  return r.map((x) => x.payload).sort((a, b) => b.startsAt.localeCompare(a.startsAt));
}

export async function testOfferForTenant(email: string): Promise<TestOffer | null> {
  const r = await rows<TestOffer>("offer", "LOWER(payload->>'applicantEmail') = LOWER($2)", [email]);
  return r[0]?.payload ?? null;
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
    const [landlordId, tenantId] = k.refs.contacts ?? [];
    const [prop, recs, people] = await Promise.all([
      q<{ name: string; address: string; locality: string; postcode: string | null; town: string | null }>(
        `SELECT name, address, locality, postcode, town FROM os_properties WHERE id = $1 AND active`,
        [pid]
      ).catch(() => []),
      q<{ kind: Kind; payload: TestListing & TestDeal }>(`SELECT kind, payload FROM os_test_records WHERE kit_id = $1 ORDER BY created_at DESC`, [k.id]).catch(() => []),
      q<{ id: string; mobile: string | null }>(`SELECT id, mobile FROM os_contacts WHERE id = ANY($1)`, [[landlordId, tenantId].filter(Boolean)]).catch(() => []),
    ]);
    const phone = (id: string | undefined) => people.find((c) => c.id === id)?.mobile?.trim() || null;
    const home = prop[0];
    if (!home) continue;
    const listing = recs.find((r) => r.kind === "listing")?.payload ?? null;
    const deal = recs.find((r) => r.kind === "deal")?.payload ?? null;
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
  } else if (!plc) {
    actions.push({ id: "plc-start", label: "Start the PLC check", detail: "The pre-let compliance pack has not been started for this let.", href: plcHref, who: "you" });
  } else {
    const queries = plc.findings.filter((f) => f.level !== "ok");
    if (plc.state === "assembling") {
      actions.push({ id: "plc-submit", label: "Finish and submit the PLC pack", detail: "Started but not sent to compliance yet.", href: plcHref, who: "you" });
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
  /* Moving the deal on: Kirstie's job on a real deal, the tester's here. Never
     past the PLC stop until the pack is approved - that is the check's whole
     point, and the button would teach the opposite. */
  if (deal && stageKey) {
    const idx = PORTAL_STAGES.findIndex((s) => s.key === stageKey);
    const next = PORTAL_STAGES[idx + 1];
    const plcAt = PORTAL_STAGES.findIndex((s) => s.key === "plc");
    /* At the PLC stop means the pack is not approved yet (testDealStage moves an approved one past it). */
    if (next && idx !== plcAt) {
      actions.push({
        id: "test-advance",
        label: `Move the deal on to ${next.label}`,
        detail: "On a real deal this happens as each step is done. On this test one, press it to take the next step.",
        href: null,
        who: "you",
        test: "advance",
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
export async function acceptTestOffer(appId: string, by: { name: string; email: string }): Promise<void> {
  const who = await mayPlay(appId, by.email);
  if (!who) throw new Error("That test application isn't one of yours.");
  await q(
    `UPDATE os_test_records SET payload = payload || jsonb_build_object('status', 'accepted', 'accepted', $2::text)
      WHERE kind = 'offer' AND payload->>'appId' = $1`,
    [appId, new Date().toISOString()]
  );
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

/** "Move the deal on" on a test application: one stage, from where it really is. */
export async function advanceTestDeal(appId: string, by: { email: string }, plc: PlcCase | null): Promise<void> {
  if (!(await mayPlay(appId, by.email))) throw new Error("That test application isn't one of yours.");
  const d = (await rows<TestDeal>("deal", "payload->>'appId' = $2", [appId]))[0]?.payload;
  if (!d) throw new Error("Accept the offer first - there is no deal to move on yet.");
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
