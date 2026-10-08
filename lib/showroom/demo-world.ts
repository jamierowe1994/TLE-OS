/**
 * THE BACK OFFICE DEMO'S WORLD - one invented home, and every job, visit and
 * certificate on it, at any moment of the story.
 *
 * James, 7 Oct 2026: walkthroughs for the back office (a repair, the gas
 * safety, compliance, visits and planned maintenance), each one readable as a
 * guide and clickable as a live demo that "will show them and go through that
 * process" from the tenant's, the landlord's and the office's side.
 *
 * The live demo runs the REAL screens - the Maintenance board, the contractor's
 * page, the tenant's portal - with their network answered from here
 * (components/showroom/demo/DemoNet). So the screen is always the product as
 * it is today, and only the people are invented.
 *
 * ── One story, every side ────────────────────────────────────────────────
 *
 * Each walkthrough is a story with numbered moments. `worldFor(story, at)`
 * returns everything that exists at moment `at`: the job with exactly the
 * facts it would have by then, its timeline, the contractors, the visit, the
 * certificate. Every screen in the walkthrough asks for the same moment, so
 * the tenant's portal, the board and the landlord's page always agree.
 *
 * Times are laid out BACKWARDS FROM NOW: at every moment the latest thing
 * happened a few minutes ago, and a booked visit is still ahead. Nothing here
 * is a date literal, so the demo never goes stale (the live-figures rule).
 *
 * The sample story is the Showroom's own: 8 Recreation Terrace, Nottingham;
 * Sophie Turner the tenant, Raj Chauhan the landlord, Sam Whitaker the agent.
 * Phone numbers are Ofcom's drama ranges and emails are example.com, so
 * nothing here can reach a real person even by accident.
 */

import type { Contractor, RankedContractor, WorksEvent, WorksOrder } from "@/lib/works-orders";
import type { MaintVisit } from "@/lib/landlord-maintenance-view";
import type { CompProperty, Cert } from "@/lib/compliance";
import type { VerifyItem } from "@/lib/compliance-desk";
import type { DueVisit, Finding, Inspection, InspectionEvent } from "@/lib/inspections";
import { stepOf as visitStepOf } from "@/lib/inspection-steps";
import { categoriesOf } from "@/lib/works-catalogue";

export type StoryId = "repair" | "gas" | "compliance" | "visits";
/** How a repair reaches us. */
export type WayId = "portal" | "phone" | "landlord" | "visit";

export const CAST = {
  property: "8 Recreation Terrace",
  locality: "Nottingham NG2",
  postcode: "NG2 3AB",
  lat: 52.9411,
  lng: -1.1372,
  tenant: { name: "Sophie Turner", email: "sophie.sample@example.com", phone: "07700 900123" },
  landlord: { name: "Raj Chauhan", email: "raj.sample@example.com", phone: "07700 900456" },
  agent: { name: "Sam Whitaker", phone: "0115 123 4567", email: "sam@thelettingexperts.co.uk" },
  compliance: "the compliance team",
} as const;

/** The main job and the contractor's own link, so a scene can open them by name. */
export const MAIN_JOB = "demo-job";
export const MAIN_REF = 1042;
export const DEMO_TOKEN = "showroom-demo";

const H = 3_600_000;

export const CONTRACTORS: Contractor[] = [
  contractor("c-mercer", "Mercer Heating & Gas", "Dan Mercer", "Heating & gas engineer", "0115 496 0101", "dan@mercer-heating.example.com", "Gas Safe 512 345 (sample)", "Sneinton, Nottingham"),
  contractor("c-trent", "Trent Valley Plumbing", "Lee Ashworth", "Plumber", "0115 496 0102", "lee@trentvalley.example.com", "", "West Bridgford, Nottingham"),
  contractor("c-spark", "Bright Spark Electrical", "Priya Nair", "Electrician", "0115 496 0103", "priya@brightspark.example.com", "NICEIC 600 112 (sample)", "Beeston, Nottingham"),
  contractor("c-castle", "Castle Locks & Glazing", "Tom Reid", "Locksmith and glazier", "0115 496 0104", "tom@castlelocks.example.com", "", "Lenton, Nottingham"),
];

function contractor(id: string, name: string, contact: string, trade: string, phone: string, email: string, registration: string, address: string): Contractor {
  return { id, name, contact, trade, phone, email, website: "", address, registration, notes: "", active: true, ownerId: null, createdBy: "Sample" };
}

/** The book for one job, as /api/contractors?for= ranks it: the trade that fits first, nearest first. */
export function rankedFor(o: WorksOrder): RankedContractor[] {
  const words: Record<string, string[]> = {
    "Heating & boiler": ["heating", "gas"], Gas: ["gas"], "Gas safety (CP12)": ["gas"], "Boiler service": ["heating", "gas"],
    Plumbing: ["plumb"], Electrical: ["electric"], EICR: ["electric"], "Smoke & CO alarms": ["electric"], "Locks & security": ["lock"], "Windows & doors": ["glaz", "lock"],
  };
  const want = categoriesOf(o.category).flatMap((c) => words[c] ?? []);
  const miles: Record<string, number> = { "c-mercer": 1.4, "c-trent": 2.6, "c-spark": 3.1, "c-castle": 1.9 };
  return CONTRACTORS.map((c) => ({ ...c, lat: null, lng: null, miles: miles[c.id] ?? null, fits: want.length === 0 || want.some((w) => c.trade.toLowerCase().includes(w)) }))
    .sort((a, b) => Number(b.fits) - Number(a.fits) || (a.miles ?? 99) - (b.miles ?? 99));
}

/* ─────────────────────────── the jobs ─────────────────────────── */

function blankOrder(over: Partial<WorksOrder> & Pick<WorksOrder, "id" | "ref" | "kind" | "title" | "category" | "reportedAt">): WorksOrder {
  return {
    status: "reported",
    propertyId: null,
    propertyName: CAST.property,
    locality: CAST.locality,
    landlord: CAST.landlord.name,
    tenant: CAST.tenant.name,
    tenantPhone: CAST.tenant.phone,
    tenantEmail: CAST.tenant.email,
    landlordEmail: CAST.landlord.email,
    landlordMobile: CAST.landlord.phone,
    landlordToldAt: null,
    arranging: null,
    landlordFollowUpAt: null,
    landlordResolvedAt: null,
    contractorContactedAt: null,
    contractorConfirmedAt: null,
    landlordArrangedAt: null,
    tenantHappy: null,
    tenantHappyAt: null,
    tenantHappyNote: "",
    payee: null,
    contractorToken: null,
    tenantToken: null,
    propertyLat: CAST.lat,
    propertyLng: CAST.lng,
    accountsToldAt: null,
    complianceToldAt: null,
    rehearsal: false,
    description: "",
    urgency: null,
    dueAt: null,
    reportedBy: "Tenant",
    raisedBy: CAST.agent.name,
    contractorId: null,
    contractorName: "",
    scheduledAt: null,
    access: "",
    authorityPence: 15000,
    quotePence: null,
    approvedBy: "",
    approvedAt: null,
    completedAt: null,
    completionNote: "",
    invoicePence: null,
    invoiceRef: "",
    invoicedAt: null,
    paidAt: null,
    paidHow: null,
    cancelledReason: "",
    files: [],
    createdAt: over.reportedAt,
    updatedAt: over.reportedAt,
    ...over,
  };
}

const iso = (ms: number) => new Date(ms).toISOString();

/** Other homes on the book, so the board looks like a Tuesday and not an empty room. */
function backgroundJobs(now: number): WorksOrder[] {
  return [
    blankOrder({
      id: "bg-tap", ref: 1038, kind: "repair", title: "Kitchen tap dripping constantly", category: "Plumbing", urgency: "routine",
      propertyName: "14 Arboretum Street", locality: "Nottingham NG1", tenant: "Amir Khan", tenantEmail: "amir.sample@example.com", tenantPhone: "07700 900321",
      landlord: "Helen Price", landlordEmail: "helen.sample@example.com", landlordMobile: "07700 900654",
      reportedAt: iso(now - 50 * H), dueAt: iso(now + 12 * 24 * H), landlordToldAt: iso(now - 49 * H), arranging: "us",
      contractorId: "c-trent", contractorName: "Trent Valley Plumbing", contractorContactedAt: iso(now - 48 * H), contractorConfirmedAt: iso(now - 46 * H),
      scheduledAt: iso(now + 44 * H), status: "scheduled",
    }),
    blankOrder({
      id: "bg-alarm", ref: 1043, kind: "repair", title: "Smoke alarm chirping in the hallway", category: "Electrical", urgency: "urgent",
      propertyName: "Flat 3, 22 Alfreton Road", locality: "Nottingham NG7", tenant: "Grace Okoro", tenantEmail: "grace.sample@example.com", tenantPhone: "07700 900987",
      landlord: "Peter Lomas", landlordEmail: "peter.sample@example.com", landlordMobile: "07700 900789", reportedBy: "Tenant",
      reportedAt: iso(now - 3 * H), dueAt: iso(now + 69 * H),
    }),
    blankOrder({
      id: "bg-eicr", ref: 1029, kind: "planned", title: "EICR due", category: "EICR", reportedBy: "Compliance tracker",
      propertyName: "31 Gregory Boulevard", locality: "Nottingham NG7", tenant: "Daniel Hart", tenantEmail: "daniel.sample@example.com", tenantPhone: "07700 900111",
      landlord: "Susan Field", landlordEmail: "susan.field.sample@example.com", landlordMobile: "07700 900222",
      reportedAt: iso(now - 6 * 24 * H), dueAt: iso(now + 26 * 24 * H), landlordToldAt: iso(now - 6 * 24 * H), arranging: "us",
    }),
  ];
}

/* ── The repair: Sophie's boiler ──────────────────────────────────────── */

/**
 * The moments of the repair, in order. Each is a fact the job gains, and how
 * many hours after the report it happened. `at` in worldFor counts these:
 * 0 is before anything is reported, 1 is the report, and so on.
 */
export const REPAIR_MOMENTS = [
  { id: "before", hours: 0 },
  { id: "reported", hours: 0 },
  { id: "landlord_told", hours: 0.4 },
  { id: "arranging", hours: 0.45 },
  { id: "contacted", hours: 0.6 },
  { id: "confirmed", hours: 1.5 },
  { id: "quote", hours: 2.5 },
  { id: "approved", hours: 4 },
  { id: "booked", hours: 5 },
  { id: "done", hours: 27 },
  { id: "happy", hours: 29 },
  { id: "invoiced", hours: 48 },
] as const;
export type RepairMoment = (typeof REPAIR_MOMENTS)[number]["id"];
export const repairAt = (id: RepairMoment) => REPAIR_MOMENTS.findIndex((m) => m.id === id);

/** The visit is the morning after the report: about 26 hours in. */
const VISIT_HOURS = 26;

const SOPHIE_SAYS = "The boiler keeps losing pressure and there's no hot water first thing in the morning. The gauge drops below 1 overnight. I've topped it up twice this week.";

function repairJob(at: number, way: WayId, now: number): { order: WorksOrder; events: WorksEvent[] } | null {
  if (at < 1) return null;
  const last = REPAIR_MOMENTS[Math.min(at, REPAIR_MOMENTS.length - 1)].hours;
  /* The report, placed so the latest fact happened six minutes ago. */
  const R = now - last * H - 0.1 * H;
  const t = (hours: number) => iso(R + hours * H);
  const has = (id: RepairMoment) => at >= repairAt(id);

  const fromPortal = way === "portal";
  const reportedBy = way === "landlord" ? "Landlord" : way === "visit" ? "Inspection" : "Tenant";
  /* A portal report lands as the tenant wrote it: routine, trade "Other", their
     words as the title. Anything rung in, or once the office has read it, is
     graded and given a trade. */
  const graded = !fromPortal || has("landlord_told");
  const o = blankOrder({
    id: MAIN_JOB, ref: MAIN_REF, kind: "repair",
    title: graded ? "Boiler losing pressure, no hot water in the mornings" : `Boiler / heating - ${SOPHIE_SAYS}`.slice(0, 140),
    description: way === "visit"
      ? "Found on the property visit: the boiler pressure gauge reads 0.4 bar and the tenant says she tops it up twice a week."
      : way === "landlord"
        ? "Raj says Sophie messaged him: the boiler keeps losing pressure and there's no hot water in the mornings."
        : SOPHIE_SAYS,
    category: graded ? "Heating & boiler" : "Other",
    urgency: graded ? "urgent" : "routine",
    reportedBy,
    reportedAt: t(0),
    dueAt: t(graded ? 72 : 24 * 14),
    access: "Sophie works from home on Tuesdays and Thursdays. Otherwise a key is in the office.",
    raisedBy: fromPortal ? CAST.tenant.name : CAST.agent.name,
    contractorToken: has("confirmed") ? DEMO_TOKEN : null,
    tenantToken: has("done") ? DEMO_TOKEN : null,
  });
  const ev: WorksEvent[] = [];
  const log = (hours: number, by: string, kind: string, text: string) => ev.push({ id: `ev-${ev.length}`, orderId: MAIN_JOB, at: t(hours), by, kind, text });

  log(0, fromPortal ? CAST.tenant.name : CAST.agent.name, "raised",
    fromPortal ? "Reported by the tenant in their portal." : way === "phone" ? "Sophie rang the office. Raised as urgent: no hot water." : way === "landlord" ? "Raj reported it from his landlord portal." : "Raised from the property visit.");
  if (!fromPortal && way !== "landlord") log(0, "TLE OS", "email", "Tenant emailed: \"We've got your repair\" (sophie.sample@example.com).");

  if (has("landlord_told")) {
    Object.assign(o, { landlordToldAt: t(0.4) });
    if (fromPortal) log(0.38, CAST.agent.name, "edit", "Details updated: Heating & boiler, urgent.");
    log(0.4, CAST.agent.name, "tell_landlord", "Landlord told - rang and emailed.");
    log(0.4, "TLE OS", "email", "Landlord emailed the report (raj.sample@example.com).");
  }
  if (has("arranging")) {
    o.arranging = "us";
    log(0.45, CAST.agent.name, "arranging", "We're arranging it.");
  }
  if (has("contacted")) {
    Object.assign(o, { contractorId: "c-mercer", contractorName: "Mercer Heating & Gas", contractorContactedAt: t(0.6) });
    log(0.6, CAST.agent.name, "contacted", "Mercer Heating & Gas contacted about the job.");
    log(0.6, "TLE OS", "email", "Contractor emailed the report (dan@mercer-heating.example.com).");
  }
  if (has("confirmed")) {
    Object.assign(o, { contractorConfirmedAt: t(1.5), status: "approved" });
    log(1.5, CAST.agent.name, "contractor_confirmed", "Mercer Heating & Gas confirmed they'll take it. Works order out; tenant told to expect their call.");
    log(1.5, "TLE OS", "email", "Contractor emailed the works order. Tenant emailed: \"We've found someone\".");
  }
  if (has("quote")) {
    Object.assign(o, { quotePence: 18500, status: "approval" });
    log(2.5, CAST.agent.name, "quote", "Quote £185, over the landlord's authority of £150 - waiting on them.");
    log(2.5, "TLE OS", "email", "Landlord emailed the quote for approval (raj.sample@example.com).");
  }
  if (has("approved")) {
    Object.assign(o, { approvedBy: "Raj Chauhan, by email", approvedAt: t(4), status: "approved" });
    log(4, CAST.agent.name, "approve", "Approved by Raj Chauhan, by email.");
  }
  if (has("booked")) {
    Object.assign(o, { scheduledAt: t(VISIT_HOURS), status: "scheduled" });
    log(5, "Mercer Heating & Gas", "schedule", `Booked for ${stamp(t(VISIT_HOURS))} with Mercer Heating & Gas. Set from the contractor's page.`);
    log(5, "TLE OS", "email", "Tenant emailed the date. Landlord emailed: \"It's arranged\".");
  }
  if (has("done")) {
    Object.assign(o, {
      completedAt: t(27), status: "done",
      completionNote: "Replaced the pressure relief valve, which was letting by, and repressurised to 1.3 bar. Checked overnight: holding.",
      files: [
        { key: "sample/valve-before.jpg", name: "valve-before.jpg", type: "image/jpeg", at: t(27), by: "Mercer Heating & Gas" },
        { key: "sample/valve-after.jpg", name: "valve-after.jpg", type: "image/jpeg", at: t(27), by: "Mercer Heating & Gas" },
      ],
    });
    log(27, "Mercer Heating & Gas", "done", "Done. Replaced the pressure relief valve, which was letting by, and repressurised to 1.3 bar.");
    log(27, "TLE OS", "email", "Tenant emailed: \"Are you happy with the repair?\"");
  }
  if (has("happy")) {
    Object.assign(o, { tenantHappy: "yes", tenantHappyAt: t(29) });
    log(29, CAST.tenant.name, "tenant_happy", "The tenant is happy with the work.");
  }
  if (has("invoiced")) {
    Object.assign(o, { payee: "contractor", invoicePence: 18500, invoiceRef: "MHG-2291", invoicedAt: t(48), status: "invoiced", accountsToldAt: t(48), complianceToldAt: t(27) });
    log(48, CAST.agent.name, "payee", "To be paid to Mercer Heating & Gas.");
    log(48, "Mercer Heating & Gas", "invoice", "Invoice £185 (MHG-2291) from Mercer Heating & Gas.");
    log(48, "TLE OS", "email", "Accounts told: £185 to pay.");
  }
  o.updatedAt = ev[ev.length - 1]?.at ?? o.reportedAt;
  return { order: o, events: ev.reverse() };
}

const stamp = (v: string) =>
  new Date(v).toLocaleString("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/* ── The gas safety: the yearly CP12 at Recreation Terrace ─────────────── */

export const GAS_MOMENTS = [
  { id: "due", hours: 0 },
  { id: "raised", hours: 0 },
  { id: "landlord_told", hours: 0.35 },
  { id: "contacted", hours: 0.5 },
  { id: "confirmed", hours: 3 },
  { id: "booked", hours: 5 },
  { id: "certificate", hours: 145 },
  { id: "verified", hours: 150 },
  { id: "invoiced", hours: 170 },
] as const;
/** The engineer goes six days after it is booked; the certificate was 24 days from running out when it was flagged. */
const GAS_VISIT_HOURS = 144;
const GAS_DAYS_LEFT = 24;
export const GAS_JOB = "demo-gas";
export const GAS_REF = 1051;

function gasJob(at: number, now: number): { order: WorksOrder; events: WorksEvent[]; R: number } {
  const last = GAS_MOMENTS[Math.min(at, GAS_MOMENTS.length - 1)].hours;
  const R = now - last * H - 0.1 * H;
  const t = (hours: number) => iso(R + hours * H);
  const has = (id: (typeof GAS_MOMENTS)[number]["id"]) => at >= GAS_MOMENTS.findIndex((m) => m.id === id);
  const o = blankOrder({
    id: GAS_JOB, ref: GAS_REF, kind: "planned", title: "Gas safety (CP12) renewal", category: "Gas safety (CP12)",
    description: "The yearly gas safety check. The certificate on file runs out soon.", reportedBy: "Compliance tracker", reportedAt: t(0),
    dueAt: t(GAS_DAYS_LEFT * 24), access: "Sophie works from home on Tuesdays and Thursdays. Otherwise a key is in the office.",
  });
  const ev: WorksEvent[] = [];
  const log = (hours: number, by: string, kind: string, text: string) => ev.push({ id: `ev-g-${ev.length}`, orderId: GAS_JOB, at: t(hours), by, kind, text });
  log(0, CAST.agent.name, "raised", "Booked from Compliance: the gas safety runs out soon.");
  if (has("landlord_told")) {
    Object.assign(o, { landlordToldAt: t(0.3), arranging: "us" });
    log(0.3, CAST.agent.name, "tell_landlord", "Landlord told - rang them.");
    log(0.35, CAST.agent.name, "arranging", "We're arranging it.");
  }
  if (has("contacted")) {
    Object.assign(o, { contractorId: "c-mercer", contractorName: "Mercer Heating & Gas", contractorContactedAt: t(0.5) });
    log(0.5, CAST.agent.name, "contacted", "Mercer Heating & Gas contacted about the job.");
  }
  if (has("confirmed")) {
    Object.assign(o, { contractorConfirmedAt: t(3), status: "approved", contractorToken: DEMO_TOKEN });
    log(3, CAST.agent.name, "contractor_confirmed", "Mercer Heating & Gas confirmed they'll take it. Works order out; tenant told to expect their call.");
  }
  if (has("booked")) {
    Object.assign(o, { scheduledAt: t(GAS_VISIT_HOURS), status: "scheduled" });
    log(5, "Mercer Heating & Gas", "schedule", `Booked for ${stamp(t(GAS_VISIT_HOURS))} with Mercer Heating & Gas. Set from the contractor's page.`);
  }
  if (has("certificate")) {
    Object.assign(o, {
      status: "done", completedAt: t(145), completionNote: "Marked done by the contractor with their certificate.", complianceToldAt: t(145),
      files: [{ key: "sample/CP12-8-Recreation-Terrace.pdf", name: "CP12-8-Recreation-Terrace.pdf", type: "application/pdf", at: t(145), by: "Mercer Heating & Gas" }],
    });
    log(145, "TLE OS", "compliance", "CP12-8-Recreation-Terrace.pdf filed as a certificate on the property. Waiting for compliance to check it before it goes to the landlord and the tenant.");
  }
  if (has("verified")) log(150, "TLE OS", "compliance", "Verified by compliance. Sent to the landlord, the tenant and the engineer.");
  if (has("invoiced")) {
    Object.assign(o, { payee: "contractor", invoicePence: 7200, invoiceRef: "MHG-2318", invoicedAt: t(170), status: "invoiced", accountsToldAt: t(170) });
    log(170, "Mercer Heating & Gas", "invoice", "Invoice £72 (MHG-2318) from Mercer Heating & Gas.");
  }
  o.updatedAt = ev[ev.length - 1]?.at ?? o.reportedAt;
  return { order: o, events: ev.reverse(), R };
}

/* ── The compliance book ─────────────────────────────────────────────── */

const cert = (days: number | null, attached = true): Cert => ({ expires: days == null ? null : Math.round(days), attached });
const ours = { managedByPm: true, service: "Fully Managed", agent: CAST.agent.name, gasAnswered: true } as const;
export const HOME_ID = "demo-home";
export const VISIT_ID = "demo-visit";

/** Every managed home on the sample book, Recreation Terrace's certificates as the story has them. */
function homesFor(recreation: Partial<Record<string, Cert>>): CompProperty[] {
  return [
    { id: HOME_ID, name: CAST.property, locality: `Nottingham ${CAST.postcode}`, landlord: CAST.landlord.name, tenant: CAST.tenant.name, hmo: false, hasGas: true, ...ours, certs: { eicr: cert(900), gas: cert(200), epc: cert(2400), ...recreation } },
    { id: "demo-arboretum", name: "14 Arboretum Street", locality: "Nottingham NG1 4JA", landlord: "Helen Price", tenant: "Amir Khan", hmo: false, hasGas: true, ...ours, certs: { eicr: cert(-12), gas: cert(140), epc: cert(1800) } },
    { id: "demo-alfreton", name: "22 Alfreton Road", locality: "Nottingham NG7 3NJ", landlord: "Peter Lomas", tenant: "Five sharers", hmo: true, hasGas: true, ...ours, certs: { eicr: cert(700), gas: cert(60), epc: cert(900), licence: cert(400), fire: cert(20), pat: cert(300), alarms: cert(200) } },
    { id: "demo-gregory", name: "31 Gregory Boulevard", locality: "Nottingham NG7 6LB", landlord: "Susan Field", tenant: "Daniel Hart", hmo: false, hasGas: true, ...ours, certs: { eicr: cert(26), gas: cert(210), epc: cert(300) } },
    { id: "demo-lenton", name: "5 Lenton Boulevard", locality: "Nottingham NG7 2BY", landlord: "Arun Mehta", tenant: "Chloe Walsh", hmo: false, hasGas: false, ...ours, certs: { eicr: cert(1200), epc: cert(2000) } },
    { id: "demo-mapperley", name: "22 Mapperley Road", locality: "Nottingham NG3 5AA", landlord: "Joan Fletcher", tenant: "The Osei family", hmo: false, hasGas: true, ...ours, certs: { eicr: cert(400), gas: cert(-3), epc: cert(1300) } },
  ];
}

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const GAS_READ = {
  read: { scheme: "gas_safe" as const, number: "512345", licence: "7654321", engineer: "Dan Mercer", business: "Mercer Heating & Gas", state: "read" as const, note: "", confirmed: null },
  registerName: "Gas Safe Register",
  registerUrl: "https://www.gassaferegister.co.uk/find-an-engineer/check-an-engineer/",
};

/* ── Visits: Recreation Terrace's six-monthly visit ───────────────────── */

export const VISIT_MOMENTS = ["due", "raised", "asked", "booked", "confirmed", "reported", "sent"] as const;
/** Hours after the dates were offered at which each moment is "now". The visit itself is 70 hours after. */
const VISIT_SLOT = 70;
const VISIT_NOW: Record<(typeof VISIT_MOMENTS)[number], number> = { due: -0.1, raised: 0, asked: 0.2, booked: 20.2, confirmed: VISIT_SLOT + 0.25, reported: VISIT_SLOT + 3.1, sent: VISIT_SLOT + 4.1 };

export interface VisitBook {
  inspections: Inspection[];
  findings: Record<string, Finding[]>;
  events: Record<string, InspectionEvent[]>;
  due: DueVisit[];
}

function blankVisit(over: Partial<Inspection> & Pick<Inspection, "id" | "ref" | "createdAt">): Inspection {
  return {
    kind: "interim", status: "due", propertyId: null, osPropertyId: null, listingId: null,
    propertyName: CAST.property, locality: CAST.locality, landlord: CAST.landlord.name, landlordEmail: CAST.landlord.email,
    tenant: CAST.tenant.name, tenantEmail: CAST.tenant.email, tenantPhone: CAST.tenant.phone, tenancyStart: null,
    dueAt: null, noticeHours: 24, accessMethod: "tenant_present", offered: [], accessToken: null, accessAskedAt: null,
    accessReply: null, accessRepliedAt: null, accessNote: "", bookedAt: null, tenantConfirmedAt: null, landlordToldAt: null,
    inspectorId: null, inspector: CAST.agent.name, visitedAt: null, noAccessAt: null, noAccessReason: "", condition: null, summary: "",
    reportedAt: null, reportSentAt: null, closedAt: null, cancelledReason: "", files: [], raisedBy: CAST.agent.name, rehearsal: false,
    rexpmTaskId: null, visitMins: 30, tenantAckAt: null, tenantAckNote: "", checks: { answers: {}, readings: {}, tenantSays: "" },
    appointmentId: null, updatedAt: over.createdAt, openActions: 0,
    ...over,
  };
}

/** Its step, read the way the server reads it: an open "raise a works order" with no job yet is an open action. */
export function stepped(i: Inspection, findings: Finding[]): Inspection {
  const openActions = findings.filter((f) => ["works_order", "tenant", "landlord"].includes(f.action) && !f.worksOrderId).length;
  return { ...i, openActions, step: visitStepOf({ ...i, openActions }) };
}

/**
 * The visits book at a moment. `m` is a VISIT_MOMENTS index; the repair
 * walkthrough's "found on a visit" door borrows the reported moment.
 */
export function visitsAt(m: number, now: number, raisedAs: string | null = null): VisitBook {
  const moment = VISIT_MOMENTS[Math.min(Math.max(m, 0), VISIT_MOMENTS.length - 1)];
  const A = now - VISIT_NOW[moment] * H;
  const t = (hours: number) => iso(A + hours * H);
  const has = (id: (typeof VISIT_MOMENTS)[number]) => VISIT_MOMENTS.indexOf(moment) >= VISIT_MOMENTS.indexOf(id);
  const DAY = 24 * H;
  const slots = [t(VISIT_SLOT), t(VISIT_SLOT + 4), t(VISIT_SLOT + 25)];

  const others: Inspection[] = [
    blankVisit({ id: "v-gregory", ref: 318, createdAt: iso(now - 9 * DAY), propertyName: "31 Gregory Boulevard", locality: "Nottingham NG7", tenant: "Daniel Hart", tenantEmail: "daniel.sample@example.com", landlord: "Susan Field", landlordEmail: "susan.field.sample@example.com", status: "booked", accessAskedAt: iso(now - 8 * DAY), bookedAt: iso(now + 2 * DAY + 3 * H), tenantConfirmedAt: iso(now - 7 * DAY), dueAt: iso(now + 6 * DAY) }),
    blankVisit({ id: "v-lenton", ref: 309, createdAt: iso(now - 40 * DAY), propertyName: "5 Lenton Boulevard", locality: "Nottingham NG7", tenant: "Chloe Walsh", tenantEmail: "chloe.sample@example.com", landlord: "Arun Mehta", landlordEmail: "arun.sample@example.com", status: "closed", accessAskedAt: iso(now - 39 * DAY), bookedAt: iso(now - 30 * DAY), tenantConfirmedAt: iso(now - 38 * DAY), visitedAt: iso(now - 30 * DAY), reportedAt: iso(now - 30 * DAY), reportSentAt: iso(now - 29 * DAY), closedAt: iso(now - 29 * DAY), condition: "good", summary: "Kept very well. Nothing to raise." }),
  ];
  const book: VisitBook = { inspections: [], findings: {}, events: {}, due: [] };
  for (const o of others) { book.inspections.push(stepped(o, [])); book.findings[o.id] = []; book.events[o.id] = []; }

  const dueRow = (key: string, name: string, locality: string, tenant: string, landlord: string, days: number, why: string, kind: DueVisit["kind"] = "interim"): DueVisit => ({
    key, kind, listingId: null, propertyId: null, propertyName: name, locality, landlord, landlordEmail: `${landlord.split(" ")[0].toLowerCase()}.sample@example.com`,
    tenant, tenantEmail: `${tenant.split(" ")[0].toLowerCase()}.sample@example.com`, tenantPhone: "07700 900555", tenancyStart: iso(now - 300 * DAY),
    dueAt: iso(now + days * DAY), daysAway: days, since: iso(now - 180 * DAY), why,
  });
  book.due.push(dueRow("due-arb", "14 Arboretum Street", "Nottingham NG1", "Amir Khan", "Helen Price", -9, "Every six months: the last visit was over six months ago."));
  book.due.push(dueRow("due-alf", "22 Alfreton Road", "Nottingham NG7", "Five sharers", "Peter Lomas", 12, "An HMO: every three months.", "hmo"));

  if (!has("raised")) {
    book.due.unshift({ ...dueRow("due-rec", CAST.property, CAST.locality, CAST.tenant.name, CAST.landlord.name, 5, "Every six months: the last visit was in the spring."), landlordEmail: CAST.landlord.email, tenantEmail: CAST.tenant.email, tenantPhone: CAST.tenant.phone });
    return book;
  }

  const i = blankVisit({ id: VISIT_ID, ref: 321, createdAt: t(0), dueAt: iso(A + 5 * DAY), accessToken: DEMO_TOKEN });
  const ev: InspectionEvent[] = [];
  const log = (hours: number, by: string, kind: string, text: string) => ev.push({ id: `iv-${ev.length}`, inspectionId: VISIT_ID, at: t(hours), by, kind, text });
  log(0, CAST.agent.name, "raised", "Raised from the due list.");
  if (has("asked")) {
    Object.assign(i, { status: "arranging", offered: slots, accessAskedAt: t(0.1) });
    log(0.1, CAST.agent.name, "ask_access", "Access asked of Sophie Turner - 3 dates offered, 24 hours notice.");
    log(0.1, "TLE OS", "email", `Tenant emailed the dates (${CAST.tenant.email}).`);
  }
  if (has("booked")) {
    Object.assign(i, { accessReply: "yes", accessRepliedAt: t(20), bookedAt: slots[0], status: "booked" });
    log(20, CAST.tenant.name, "access_reply", "Sophie Turner agreed to the visit.");
    log(20, CAST.tenant.name, "access", "Booked from the tenant's own choice of time.");
  }
  if (has("confirmed")) {
    i.tenantConfirmedAt = t(20.5);
    log(20.5, CAST.agent.name, "confirm", "Marked as confirmed with the tenant.");
    log(20.5, "TLE OS", "email", `Tenant emailed the confirmation (${CAST.tenant.email}).`);
  }
  let findings: Finding[] = [];
  if (has("reported")) {
    const at = t(VISIT_SLOT + 1);
    const f = (id: string, room: string, item: string, condition: Finding["condition"], note: string, action: Finding["action"], responsible: Finding["responsible"] = null, worksOrderId: string | null = null): Finding =>
      ({ id, inspectionId: VISIT_ID, room, item, condition, note, action, responsible, worksOrderId, photos: [], createdAt: at, createdBy: CAST.agent.name });
    findings = [
      f("f-alarms", "Meters & alarms", "Smoke and CO alarms", "good", "Both tested and sounding.", "none"),
      f("f-boiler", "Kitchen", "Boiler pressure", "fair", "Gauge reads 0.4 bar. Sophie tops it up about twice a week, and there's no hot water first thing.", "works_order", "landlord", has("sent") || raisedAs ? raisedAs ?? MAIN_JOB : null),
      f("f-kitchen", "Kitchen", "Worktops, oven and sink", "good", "Clean and well kept.", "none"),
      f("f-bath", "Bathroom", "Extractor fan", "fair", "Slow to clear steam. Working, but worth watching.", "monitor"),
      f("f-bed", "Bedroom 1", "Window", "fair", "Some condensation on the frame. Asked Sophie to keep the trickle vent open.", "tenant", "tenant"),
      f("f-living", "Living room", "Walls, floor and furniture", "good", "As at check-in.", "none"),
    ];
    Object.assign(i, {
      status: "reported", visitedAt: t(VISIT_SLOT + 0.75), condition: "good", reportedAt: t(VISIT_SLOT + 3),
      summary: "A well-kept home. One job: the boiler is losing pressure and has been raised for an engineer. Sophie has been asked to ventilate the bedroom.",
      checks: {
        answers: { smoke: { answer: "ok" }, co: { answer: "ok" }, heating: { answer: "issue", note: "Boiler losing pressure - raised as a job." }, damp: { answer: "ok" }, leaks: { answer: "ok" }, safety: { answer: "ok" }, occupants: { answer: "ok" }, pets: { answer: "ok" }, outside: { answer: "ok" } },
        readings: { meter_gas: "04127", meter_electric: "33810" }, tenantSays: "The boiler needs topping up a couple of times a week.",
      },
    });
    log(VISIT_SLOT + 0.75, CAST.agent.name, "visited", "Visited by Sam Whitaker.");
    log(VISIT_SLOT + 3, CAST.agent.name, "report", "Written up as good.");
  }
  if (has("sent")) {
    i.reportSentAt = t(VISIT_SLOT + 4);
    log(VISIT_SLOT + 3.5, CAST.agent.name, "works_order", `Kitchen - Boiler pressure raised as works order ${MAIN_REF}.`);
    log(VISIT_SLOT + 4, CAST.agent.name, "report_sent", "Report marked as sent to Raj Chauhan.");
    log(VISIT_SLOT + 4, "TLE OS", "email", `Landlord emailed the report (${CAST.landlord.email}).`);
  }
  i.updatedAt = ev[ev.length - 1]?.at ?? i.createdAt;
  book.inspections.unshift(stepped(i, findings));
  book.findings[VISIT_ID] = findings;
  book.events[VISIT_ID] = ev.reverse();
  return book;
}

/* ─────────────────────────── the world ─────────────────────────── */

export interface DemoWorld {
  story: StoryId;
  at: number;
  way: WayId;
  orders: WorksOrder[];
  events: Record<string, WorksEvent[]>;
  contractors: Contractor[];
  /** The landlord's visits list, when the story has its own (the visits walkthrough). */
  visits?: MaintVisit[];
  /** The compliance book (/api/compliance, /api/compliance/book). */
  homes: CompProperty[];
  /** Compliance's To verify list (/api/compliance-desk). */
  verify: VerifyItem[];
  /** Inspections, their findings and timelines, and the due list (/api/inspections, /api/visit). */
  book: VisitBook;
}

/** The moments of each story, by name, in order. */
export const MOMENTS: Record<StoryId, readonly string[]> = {
  repair: REPAIR_MOMENTS.map((m) => m.id),
  gas: GAS_MOMENTS.map((m) => m.id),
  compliance: ["book", "uploaded", "verified"],
  visits: [...VISIT_MOMENTS],
};
export const momentIndex = (story: StoryId, id: string) => Math.max(0, MOMENTS[story].indexOf(id));

export function worldFor(story: StoryId, at: number, way: WayId = "portal", now = Date.now()): DemoWorld {
  const orders = backgroundJobs(now);
  const events: Record<string, WorksEvent[]> = {};
  for (const o of orders) events[o.id] = [{ id: `${o.id}-0`, orderId: o.id, at: o.reportedAt, by: o.reportedBy === "Tenant" ? o.tenant : CAST.agent.name, kind: "raised", text: `Reported by ${o.reportedBy.toLowerCase()}.` }];
  let homes = homesFor({});
  let verify: VerifyItem[] = [];
  const DAY = 24 * H;

  if (story === "repair") {
    const main = repairJob(at, way, now);
    if (main) {
      orders.unshift(main.order);
      events[MAIN_JOB] = main.events;
    }
  }

  if (story === "gas") {
    const verified = at >= GAS_MOMENTS.findIndex((m) => m.id === "verified");
    const raised = at >= 1;
    const g = gasJob(at, now);
    if (raised) {
      orders.unshift(g.order);
      events[GAS_JOB] = g.events;
    }
    const leftDays = (g.R + GAS_DAYS_LEFT * DAY - now) / DAY;
    homes = homesFor({ gas: cert(verified ? 365 : leftDays) });
    if (at === GAS_MOMENTS.findIndex((m) => m.id === "certificate")) {
      verify = [{
        kind: "certificate", id: "cert-gas", door: "Contractor", property: `${CAST.property}, ${CAST.locality}`, what: "Gas safety (CP12)",
        expiry: ymd(now + 365 * DAY), fileName: "CP12-8-Recreation-Terrace.pdf", fileKey: "sample/CP12-8-Recreation-Terrace.pdf",
        by: "Mercer Heating & Gas", source: `the contractor's page, job #${GAS_REF}`, agent: CAST.agent.name, addedAt: iso(now - 5 * 60_000), queried: null,
        register: GAS_READ,
      }];
    }
  }

  if (story === "compliance") {
    const uploaded = at >= 1;
    const verified = at >= 2;
    homes = homesFor({ eicr: cert(verified ? 1826 : 18) });
    if (uploaded && !verified) {
      verify = [
        {
          kind: "landlord_document", id: "ll-eicr", door: "Landlord", property: `${CAST.property}, ${CAST.locality}`, what: "Electrical safety (EICR)",
          expiry: null, fileName: "EICR-Recreation-Terrace-2026.pdf", fileKey: "sample/eicr.pdf", by: CAST.landlord.name, source: "the landlord's portal",
          agent: CAST.agent.name, addedAt: iso(now - 40 * 60_000), queried: null, fileAs: { types: [{ id: "eicr", label: "Electrical safety (EICR)" }] },
          register: { read: { scheme: "niceic", number: "600112", licence: "", engineer: "Priya Nair", business: "Bright Spark Electrical", state: "read", note: "", confirmed: null }, registerName: "NICEIC", registerUrl: "https://www.niceic.com/find-a-contractor" },
        },
        {
          kind: "certificate", id: "cert-arb", door: "Contractor", property: "14 Arboretum Street, Nottingham NG1", what: "Gas safety (CP12)",
          expiry: ymd(now + 364 * DAY), fileName: "CP12-14-Arboretum-St.pdf", fileKey: "sample/cp12-arb.pdf", by: "Mercer Heating & Gas", source: "the contractor's page, job #1036",
          agent: CAST.agent.name, addedAt: iso(now - 26 * H), queried: null, register: GAS_READ,
        },
        {
          kind: "certificate", id: "cert-epc", door: "Agent", property: "31 Gregory Boulevard, Nottingham NG7", what: "Energy Performance Certificate (EPC)",
          expiry: ymd(now + 3650 * DAY), fileName: "EPC-31-Gregory-Blvd.pdf", fileKey: "sample/epc.pdf", by: CAST.agent.name, source: "the property file: we uploaded it",
          agent: CAST.agent.name, addedAt: iso(now - 3 * H), queried: null,
        },
      ];
    }
  }

  /* Visits: their own walkthrough, and the repair's "found on a visit" door,
     which opens on the visit written up and the boiler not yet raised. */
  let book: VisitBook = visitsAt(story === "visits" ? at : -1, now);
  let visits: MaintVisit[] | undefined;
  if (story === "repair" && way === "visit") book = visitsAt(VISIT_MOMENTS.indexOf("reported"), now, at >= 1 ? MAIN_JOB : null);
  if (story === "visits") {
    if (at >= VISIT_MOMENTS.indexOf("sent")) {
      /* The boiler, raised from the visit, is on the board as reported. */
      const main = repairJob(1, "visit", now);
      if (main) { orders.unshift(main.order); events[MAIN_JOB] = main.events; }
    }
    const i = book.inspections.find((x) => x.id === VISIT_ID);
    const dayOf = (v: string | null) => (v ? new Date(v).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");
    const short = (v: string | null) => (v ? new Date(v).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : "");
    visits = [
      ...(i ? [{
        id: i.id, label: "Property visit", property: CAST.property,
        when: i.reportSentAt ? dayOf(i.visitedAt) : i.bookedAt ? `Booked for ${short(i.bookedAt)}` : i.dueAt ? `Due ${dayOf(i.dueAt)}` : "Being arranged",
        state: (i.reportSentAt ? "done" : i.bookedAt ? "upcoming" : "open") as MaintVisit["state"],
        note: i.reportSentAt ? `Good condition - ${i.summary}` : i.bookedAt ? "Your tenant has agreed the date" : "We're arranging a date with your tenant",
      }] : []),
      { id: "v-prev", label: "Property visit", property: CAST.property, when: dayOf(iso(now - 180 * DAY)), state: "done" as const, note: "Good condition - kept well, nothing to raise" },
    ];
  }

  return { story, at, way, orders, events, contractors: CONTRACTORS, homes, verify, book, visits };
}

export function isStory(v: string | null | undefined): v is StoryId {
  return v === "repair" || v === "gas" || v === "compliance" || v === "visits";
}
export function isWay(v: string | null | undefined): v is WayId {
  return v === "portal" || v === "phone" || v === "landlord" || v === "visit";
}
