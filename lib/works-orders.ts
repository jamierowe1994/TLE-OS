import "server-only";
import { randomBytes } from "node:crypto";
import { hasDb, q } from "@/lib/db";
import { uid } from "@/lib/auth";
import { addFileDoc } from "@/lib/file-documents";
import { OTHER as OTHER_DOC } from "@/lib/doc-types";
import { TEST_STREET } from "@/lib/test-guard";
import { asksFor, askById, upsertAsks, resendAsk, recordAskQuote, declineAsk, acceptAsk, isLive, type QuoteAsk } from "@/lib/works-quotes";
import { chaseOf, stopChaseOnMove } from "@/lib/works-chase-store";
import type { WorksChase } from "@/lib/works-chase-rules";
export type { QuoteAsk };

/**
 * Works orders: every job done on a managed home, from the phone call to
 * the paid invoice.
 *
 * James, 7 Sep 2026: "break it down into two different sections -
 * maintenance works orders and maintenance repairs. If a water pipe bursts,
 * that's an emergency one, but we'll also have property maintenance, which
 * is things like gas safeties." So a job has a KIND:
 *
 *   repair    reactive. Somebody reported something broken. Carries an
 *             URGENCY, and the urgency sets the date it must be attended by.
 *   planned   scheduled. A gas safety, an EICR, a boiler service, an
 *             inspection. Carries a DUE date, usually the certificate's
 *             expiry, and nothing is broken.
 *
 * ── The life of a job ────────────────────────────────────────────────────
 *
 *   reported   → in. Somebody rang, wrote, or the compliance tracker raised it.
 *   approval   → the landlord has to say yes. A quote over their authority
 *                limit (what they pre-authorised us to spend, from the terms
 *                of business - £150 unless the job says otherwise) waits here.
 *   approved   → cleared to go, contractor still to book.
 *   scheduled  → a contractor and a date.
 *   done       → the work is done. The completion note and any certificate
 *                are on the job.
 *   invoiced   → the contractor's invoice is on the job.
 *   paid       → settled, and how: charged to the landlord through PayProp,
 *                paid by the landlord direct, or paid by TLE.
 *   cancelled  → at any point, with a reason.
 *
 * Nothing skips a step by accident, but nothing insists on ceremony either:
 * a job under the authority limit goes reported → approved on its own, and
 * a contractor booked on the phone can be recorded straight to scheduled.
 *
 * ── Money ────────────────────────────────────────────────────────────────
 *
 * Pence, always, as integers. PayProp is READ-ONLY to the OS, so "charged
 * through PayProp" is recorded here as the fact and done there by a person.
 */

/* The words live in lib/works-catalogue, which is NOT server-only, so a client
   component can draw an urgency without keeping its own copy. Imported for use
   in this file AND re-exported, so every existing importer of this module
   carries on unchanged. */
import { KINDS, URGENCIES, REPAIR_CATEGORIES, PLANNED_CATEGORIES, categoriesOf, type Kind, type Urgency } from "./works-catalogue";
export { KINDS, URGENCIES, REPAIR_CATEGORIES, PLANNED_CATEGORIES };
export type { Kind, Urgency };

export const STATUSES = [
  { id: "reported", label: "Reported", blurb: "In, and not yet cleared to go." },
  { id: "approval", label: "Awaiting landlord", blurb: "A quote over the landlord's authority. Waiting on their yes." },
  { id: "approved", label: "Approved", blurb: "Cleared. A contractor still to book." },
  { id: "scheduled", label: "Booked", blurb: "A contractor and a date." },
  { id: "done", label: "Done", blurb: "The work is finished." },
  { id: "invoiced", label: "Invoiced", blurb: "The contractor's invoice is on the job." },
  { id: "paid", label: "Paid", blurb: "Settled." },
  { id: "cancelled", label: "Cancelled", blurb: "Not going ahead." },
] as const;
export type Status = (typeof STATUSES)[number]["id"];
export const OPEN_STATUSES: Status[] = ["reported", "approval", "approved", "scheduled"];

/**
 * THE STEP: what the job needs next, one thing at a time. Read from the
 * facts, never set. James, 7 Sep 2026: "this should all feel like a
 * workflow, so it's only one thing at a time... they're just going to chunk
 * through one thing at a time."
 */
export { STEPS, stepOf, type StepId } from "@/lib/works-steps";
import { stepOf as stepOfOrder, isSkippable, skippedLine, LANDLORD_INVOICE_ANSWERS, type LandlordInvoiceAnswer, type SkippableStep } from "@/lib/works-steps";
export { LANDLORD_INVOICE_ANSWERS, type LandlordInvoiceAnswer };

export const PAID_HOW = [
  { id: "payprop", label: "Charged to the landlord through PayProp" },
  { id: "landlord", label: "Paid by the landlord direct" },
  { id: "tle", label: "Paid by TLE" },
  { id: "tenant", label: "Recharged to the tenant" },
] as const;
export type PaidHow = (typeof PAID_HOW)[number]["id"];

export const REPORTED_BY = ["Tenant", "Landlord", "Agent", "Inspection", "Compliance tracker", "Contractor"] as const;

/** The landlord's pre-authorised spend, in pence, unless the job says otherwise. */
export const DEFAULT_AUTHORITY_PENCE = 15000;

export interface Contractor {
  id: string;
  /** The firm, or the person if they trade under their own name. */
  name: string;
  /** Who you ring there. */
  contact: string;
  trade: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  /** The old one-box registration. Still read, as "Registration", when the boxes below are blank. */
  registration: string;
  /* Their credentials, one box each (James, 21 Oct 2026). Optional on the
     type so a contractor made up elsewhere (the showroom) still fits; a row
     read from the database always carries them. */
  gasSafeNumber?: string;
  niceicNumber?: string;
  napitNumber?: string;
  otherRegistration?: string;
  publicLiabilityInsurer?: string;
  publicLiabilityNumber?: string;
  /** YYYY-MM-DD, or null when not given. */
  publicLiabilityExpiry?: string | null;
  publicLiabilityCoverPence?: number | null;
  /** Read off their website (lib/contractor-logo). Blank when there is none. */
  logoUrl?: string;
  notes: string;
  active: boolean;
  /** Whose book they are in. Null is the company's: everyone can use them. */
  ownerId: string | null;
  createdBy: string;
}

/** What a contractor has done for us, off the jobs they were on. */
export interface ContractorStats {
  jobs: number;
  open: number;
  quotedPence: number;
  invoicedPence: number;
  paidPence: number;
  outstandingPence: number;
  lastJobAt: string | null;
}

export interface WorksOrder {
  id: string;
  ref: number;
  kind: Kind;
  status: Status;
  /** The REX property, when the home is on REX. */
  propertyId: string | null;
  propertyName: string;
  locality: string;
  landlord: string;
  /** The tenant's name. Their number is tenantPhone, not buried in here. */
  tenant: string;
  tenantPhone: string;
  /** Where the step emails go. Blank means nobody is told, and the timeline says so. */
  tenantEmail: string;
  /** Every tenant on the home, for the contractor to arrange access with. Empty on older jobs: read tenantsOf(). */
  tenants: JobTenant[];
  landlordEmail: string;
  landlordMobile: string;
  /** Planned jobs: the agent skipped the landlord, who hears nothing about this one. */
  landlordSkipped: boolean;
  /** A discreet repair: no automatic email goes to any tenant on it. */
  quietTenants: boolean;
  /** Steps skipped for now (lib/works-steps SKIPPABLE). Nothing is stamped to fake them. */
  skippedSteps: string[];
  /** The contractor was asked for a quote first, before any works order (Sean, 20 Oct 2026). */
  quoteRequestedAt: string | null;
  /** Every contractor asked for that quote, each with their own answer (Sean, 21 Oct 2026). Read by getOrder only; empty on a list. */
  quoteAsks: QuoteAsk[];
  /** Chasing the contractor for an answer (Sean, 26 Oct 2026). Read by getOrder only; absent on a list. */
  chase?: WorksChase | null;
  /** The contractor the works order last went to, and their name then. Null before 21 Oct 2026, or before it goes. */
  orderSentTo: string | null;
  orderSentToName: string;
  /** Planned jobs: when the tenants were sent the booking, by hand. */
  tenantsToldBookedAt: string | null;
  /** Planned jobs: the tenants are told who will be in touch to arrange access (a tick, off by default). */
  accessNotice: boolean;
  /* ── the workflow's facts (James and Michael, 7 Sep 2026) ── */
  landlordToldAt: string | null;
  /** Who is arranging it: the landlord with their own people, or us. */
  arranging: "landlord" | "us" | null;
  landlordFollowUpAt: string | null;
  landlordResolvedAt: string | null;
  contractorContactedAt: string | null;
  contractorConfirmedAt: string | null;
  landlordArrangedAt: string | null;
  tenantHappy: "yes" | "no" | null;
  tenantHappyAt: string | null;
  tenantHappyNote: string;
  /** Who gets paid: the contractor, or the agent who paid out of their own pocket. */
  payee: "contractor" | "agent" | null;
  contractorToken: string | null;
  tenantToken: string | null;
  propertyLat: number | null;
  propertyLng: number | null;
  accountsToldAt: string | null;
  complianceToldAt: string | null;
  /* ── the landlord authorises the invoice (Kirstie Mulholland, 20 Oct 2026) ── */
  landlordInvoiceToken: string | null;
  landlordInvoiceAskedAt: string | null;
  /** pay: take it from the rent. direct: they pay the contractor themselves. query: don't pay yet. */
  landlordInvoiceAnswer: LandlordInvoiceAnswer | null;
  landlordInvoiceAnsweredAt: string | null;
  landlordInvoiceNote: string;
  /** "the landlord" from their link, or the agent who recorded a phone answer. */
  landlordInvoiceBy: string;
  /** On the payment run (James, 21 Oct 2026): when the office keyed the
   *  invoice on PayProp, and who. The job stays invoiced until marked paid. */
  payrunAt: string | null;
  payrunBy: string;
  /** A walkthrough job: real machinery, invented people, no email leaves. */
  rehearsal: boolean;
  title: string;
  description: string;
  category: string;
  urgency: Urgency | null;
  /** Repairs: attend by. Planned: due by. */
  dueAt: string | null;
  reportedBy: string;
  reportedAt: string;
  raisedBy: string;
  contractorId: string | null;
  contractorName: string;
  scheduledAt: string | null;
  /** Repairs: what the tenant needs to know; planned: access notes. */
  access: string;
  authorityPence: number;
  quotePence: number | null;
  approvedBy: string;
  approvedAt: string | null;
  completedAt: string | null;
  completionNote: string;
  invoicePence: number | null;
  invoiceRef: string;
  invoicedAt: string | null;
  paidAt: string | null;
  paidHow: PaidHow | null;
  cancelledReason: string;
  /** Files on the job: photos of the fault, the invoice, the certificate. R2 keys. */
  files: { key: string; name: string; type: string; at: string; by: string; kind?: "invoice" | "quote"; contractor?: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface JobTenant { name: string; phone: string; email: string; room?: string }

/** Every tenant on a job: the list when it has one, the single tenant on older jobs. */
export function tenantsOf(o: Pick<WorksOrder, "tenants" | "tenant" | "tenantPhone" | "tenantEmail">): JobTenant[] {
  if (o.tenants?.length) return o.tenants;
  return o.tenant || o.tenantPhone || o.tenantEmail ? [{ name: o.tenant, phone: o.tenantPhone, email: o.tenantEmail }] : [];
}

const cleanTenants = (list: unknown): JobTenant[] =>
  (Array.isArray(list) ? list : [])
    .map((t) => (t && typeof t === "object" ? (t as Record<string, unknown>) : {}))
    .map((t) => ({ name: s(t.name).trim(), phone: s(t.phone).trim(), email: s(t.email).trim().toLowerCase(), ...(s(t.room).trim() ? { room: s(t.room).trim() } : {}) }))
    .filter((t) => t.name || t.phone || t.email)
    .slice(0, 30);

export interface WorksEvent {
  id: string;
  orderId: string;
  at: string;
  by: string;
  kind: string;
  text: string;
}

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v));
const n = (v: unknown) => (v == null || v === "" ? null : Number(v));
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

function toOrder(r: Row): WorksOrder {
  return {
    id: s(r.id),
    ref: Number(r.ref ?? 0),
    kind: (s(r.kind) as Kind) || "repair",
    status: (s(r.status) as Status) || "reported",
    propertyId: r.property_id ? s(r.property_id) : null,
    propertyName: s(r.property_name),
    locality: s(r.locality),
    landlord: s(r.landlord),
    tenant: s(r.tenant),
    tenantPhone: s(r.tenant_phone),
    tenantEmail: s(r.tenant_email),
    tenants: cleanTenants(r.tenants),
    landlordEmail: s(r.landlord_email),
    landlordMobile: s(r.landlord_mobile),
    landlordSkipped: r.landlord_skipped === true,
    quietTenants: r.quiet_tenants === true,
    skippedSteps: Array.isArray(r.skipped_steps) ? (r.skipped_steps as unknown[]).filter((x): x is string => typeof x === "string") : [],
    tenantsToldBookedAt: iso(r.tenants_told_booked_at),
    quoteRequestedAt: iso(r.quote_requested_at),
    quoteAsks: [],
    orderSentTo: r.order_sent_to ? s(r.order_sent_to) : null,
    orderSentToName: s(r.order_sent_to_name),
    accessNotice: r.tenants_access_notice === true,
    landlordToldAt: iso(r.landlord_told_at),
    arranging: r.arranging === "landlord" || r.arranging === "us" ? r.arranging : null,
    landlordFollowUpAt: iso(r.landlord_follow_up_at),
    landlordResolvedAt: iso(r.landlord_resolved_at),
    contractorContactedAt: iso(r.contractor_contacted_at),
    contractorConfirmedAt: iso(r.contractor_confirmed_at),
    landlordArrangedAt: iso(r.landlord_arranged_at),
    tenantHappy: r.tenant_happy === "yes" || r.tenant_happy === "no" ? r.tenant_happy : null,
    tenantHappyAt: iso(r.tenant_happy_at),
    tenantHappyNote: s(r.tenant_happy_note),
    payee: r.payee === "contractor" || r.payee === "agent" ? r.payee : null,
    contractorToken: r.contractor_token ? s(r.contractor_token) : null,
    tenantToken: r.tenant_token ? s(r.tenant_token) : null,
    propertyLat: n(r.property_lat),
    propertyLng: n(r.property_lng),
    accountsToldAt: iso(r.accounts_told_at),
    complianceToldAt: iso(r.compliance_told_at),
    landlordInvoiceToken: r.landlord_invoice_token ? s(r.landlord_invoice_token) : null,
    landlordInvoiceAskedAt: iso(r.landlord_invoice_asked_at),
    landlordInvoiceAnswer: r.landlord_invoice_answer === "pay" || r.landlord_invoice_answer === "direct" || r.landlord_invoice_answer === "query" ? r.landlord_invoice_answer : null,
    landlordInvoiceAnsweredAt: iso(r.landlord_invoice_answered_at),
    landlordInvoiceNote: s(r.landlord_invoice_note),
    landlordInvoiceBy: s(r.landlord_invoice_by),
    payrunAt: iso(r.payrun_at),
    payrunBy: s(r.payrun_by),
    rehearsal: r.rehearsal === true,
    title: s(r.title),
    description: s(r.description),
    category: s(r.category),
    urgency: r.urgency ? (s(r.urgency) as Urgency) : null,
    dueAt: iso(r.due_at),
    reportedBy: s(r.reported_by),
    reportedAt: iso(r.reported_at) ?? new Date().toISOString(),
    raisedBy: s(r.raised_by),
    contractorId: r.contractor_id ? s(r.contractor_id) : null,
    contractorName: s(r.contractor_name),
    scheduledAt: iso(r.scheduled_at),
    access: s(r.access),
    authorityPence: Number(r.authority_pence ?? DEFAULT_AUTHORITY_PENCE),
    quotePence: n(r.quote_pence),
    approvedBy: s(r.approved_by),
    approvedAt: iso(r.approved_at),
    completedAt: iso(r.completed_at),
    completionNote: s(r.completion_note),
    invoicePence: n(r.invoice_pence),
    invoiceRef: s(r.invoice_ref),
    invoicedAt: iso(r.invoiced_at),
    paidAt: iso(r.paid_at),
    paidHow: r.paid_how ? (s(r.paid_how) as PaidHow) : null,
    cancelledReason: s(r.cancelled_reason),
    files: Array.isArray(r.files) ? (r.files as WorksOrder["files"]) : [],
    createdAt: iso(r.created_at) ?? new Date().toISOString(),
    updatedAt: iso(r.updated_at) ?? new Date().toISOString(),
  };
}

const COLS = `id, ref, kind, status, property_id, property_name, locality, landlord, tenant, tenant_phone, tenant_email, landlord_email, landlord_mobile,
  landlord_told_at, arranging, landlord_follow_up_at, landlord_resolved_at, contractor_contacted_at, contractor_confirmed_at, landlord_arranged_at,
  tenant_happy, tenant_happy_at, tenant_happy_note, payee, contractor_token, tenant_token, property_lat, property_lng, accounts_told_at, compliance_told_at,
  title, description, category, urgency,
  due_at, reported_by, reported_at, raised_by, contractor_id, contractor_name, scheduled_at, access, authority_pence, quote_pence,
  approved_by, approved_at, completed_at, completion_note, invoice_pence, invoice_ref, invoiced_at, paid_at, paid_how,
  cancelled_reason, files, rehearsal, tenants, landlord_skipped, quiet_tenants, tenants_told_booked_at, tenants_access_notice, skipped_steps, quote_requested_at,
  landlord_invoice_token, landlord_invoice_asked_at, landlord_invoice_answer, landlord_invoice_answered_at, landlord_invoice_note, landlord_invoice_by, payrun_at, payrun_by, order_sent_to, order_sent_to_name, created_at, updated_at`;

/* ── contractors ────────────────────────────────────────────────────────── */

function toContractor(r: Row): Contractor {
  return {
    id: s(r.id), name: s(r.name), contact: s(r.contact), trade: s(r.trade), phone: s(r.phone), email: s(r.email), website: s(r.website), address: s(r.address),
    registration: s(r.registration), notes: s(r.notes), active: r.active !== false, ownerId: r.owner_id ? s(r.owner_id) : null, createdBy: s(r.created_by),
    gasSafeNumber: s(r.gas_safe_number), niceicNumber: s(r.niceic_number), napitNumber: s(r.napit_number), otherRegistration: s(r.other_registration),
    publicLiabilityInsurer: s(r.public_liability_insurer), publicLiabilityNumber: s(r.public_liability_number),
    publicLiabilityExpiry: plainDate(r.public_liability_expiry),
    publicLiabilityCoverPence: r.public_liability_cover_pence == null ? null : Number(r.public_liability_cover_pence),
    logoUrl: s(r.logo_url),
  };
}

/** A DATE column as YYYY-MM-DD. pg hands it over as local midnight, so read it back in local parts. */
function plainDate(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(v));
  return m ? m[1] : null;
}

/** The logo read off their website, kept on its own so a save never wipes it. */
export async function setContractorLogo(id: string, logoUrl: string): Promise<void> {
  if (!hasDb()) return;
  await q(`UPDATE os_contractors SET logo_url = $2, updated_at = NOW() WHERE id = $1`, [id, logoUrl]);
}

/** The company's contractors and this person's own. Nobody else's. */
export async function listContractors(forUserId?: string | null): Promise<Contractor[]> {
  if (!hasDb()) return [];
  return (
    await q<Row>(`SELECT * FROM os_contractors WHERE NOT rehearsal AND (owner_id IS NULL OR owner_id = $1) ORDER BY active DESC, (owner_id IS NULL), trade, name`, [forUserId ?? ""])
  ).map(toContractor);
}

/** Every book at once, agents' own included: the office pays the invoices,
 *  so it sees every contractor (James, 19 Oct 2026). */
export async function listAllContractors(): Promise<Contractor[]> {
  if (!hasDb()) return [];
  return (await q<Row>(`SELECT * FROM os_contractors WHERE NOT rehearsal ORDER BY active DESC, (owner_id IS NULL), trade, name`)).map(toContractor);
}

export async function getContractor(id: string): Promise<Contractor | null> {
  if (!hasDb()) return null;
  const [r] = await q<Row>(`SELECT * FROM os_contractors WHERE id = $1`, [id]);
  return r ? toContractor(r) : null;
}

export async function saveContractor(input: Partial<Contractor> & { name: string; trade: string }, by: string): Promise<Contractor> {
  const id = input.id || uid();
  const [r] = await q<Row>(
    `INSERT INTO os_contractors (id, name, contact, trade, phone, email, website, address, registration, notes, active, owner_id, created_by,
        gas_safe_number, niceic_number, napit_number, other_registration, public_liability_insurer, public_liability_number,
        public_liability_expiry, public_liability_cover_pence)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
        coalesce($14, ''), coalesce($15, ''), coalesce($16, ''), coalesce($17, ''), coalesce($18, ''), coalesce($19, ''), $20::date, $21::bigint)
     ON CONFLICT (id) DO UPDATE SET name = $2, contact = $3, trade = $4, phone = $5, email = $6, website = $7, address = $8, registration = $9, notes = $10, active = $11, owner_id = $12,
        gas_safe_number = coalesce($14, os_contractors.gas_safe_number), niceic_number = coalesce($15, os_contractors.niceic_number),
        napit_number = coalesce($16, os_contractors.napit_number), other_registration = coalesce($17, os_contractors.other_registration),
        public_liability_insurer = coalesce($18, os_contractors.public_liability_insurer), public_liability_number = coalesce($19, os_contractors.public_liability_number),
        public_liability_expiry = CASE WHEN $22 THEN $20::date ELSE os_contractors.public_liability_expiry END,
        public_liability_cover_pence = CASE WHEN $23 THEN $21::bigint ELSE os_contractors.public_liability_cover_pence END,
        updated_at = NOW()
     RETURNING *`,
    [
      id, input.name.trim(), (input.contact ?? "").trim(), input.trade.trim(), (input.phone ?? "").trim(), (input.email ?? "").trim().toLowerCase(),
      (input.website ?? "").trim(), (input.address ?? "").trim(), (input.registration ?? "").trim(), (input.notes ?? "").trim(), input.active !== false,
      input.ownerId ?? null, by,
      /* The credentials (21 Oct 2026): a box left out of the save keeps what
         it held, so a form that does not show them (the one inside a job)
         never wipes them. */
      given(input.gasSafeNumber), given(input.niceicNumber), given(input.napitNumber), given(input.otherRegistration),
      given(input.publicLiabilityInsurer), given(input.publicLiabilityNumber),
      /^\d{4}-\d{2}-\d{2}$/.test(input.publicLiabilityExpiry ?? "") ? input.publicLiabilityExpiry : null,
      input.publicLiabilityCoverPence != null && Number.isFinite(Number(input.publicLiabilityCoverPence)) ? Math.round(Number(input.publicLiabilityCoverPence)) : null,
      input.publicLiabilityExpiry !== undefined, input.publicLiabilityCoverPence !== undefined,
    ]
  );
  return toContractor(r);
}

const given = (v: string | undefined) => (v === undefined ? null : String(v).trim());

/** Their record with us: the jobs, and the money through them. */
export async function contractorStats(id: string): Promise<ContractorStats> {
  const empty: ContractorStats = { jobs: 0, open: 0, quotedPence: 0, invoicedPence: 0, paidPence: 0, outstandingPence: 0, lastJobAt: null };
  if (!hasDb()) return empty;
  const [r] = await q<Row>(
    `SELECT count(*) AS jobs,
            count(*) FILTER (WHERE status IN ('reported','approval','approved','scheduled')) AS open,
            coalesce(sum(quote_pence), 0) AS quoted,
            coalesce(sum(invoice_pence), 0) AS invoiced,
            coalesce(sum(invoice_pence) FILTER (WHERE status = 'paid'), 0) AS paid,
            coalesce(sum(invoice_pence) FILTER (WHERE status = 'invoiced'), 0) AS outstanding,
            max(created_at) AS last
       FROM os_works_orders WHERE contractor_id = $1`,
    [id]
  );
  return {
    jobs: Number(r?.jobs ?? 0), open: Number(r?.open ?? 0), quotedPence: Number(r?.quoted ?? 0), invoicedPence: Number(r?.invoiced ?? 0),
    paidPence: Number(r?.paid ?? 0), outstandingPence: Number(r?.outstanding ?? 0), lastJobAt: iso(r?.last),
  };
}

/* ── orders ─────────────────────────────────────────────────────────────── */

export interface NewOrder {
  kind: Kind;
  propertyId?: string | null;
  propertyName: string;
  locality?: string;
  landlord?: string;
  tenant?: string;
  tenantEmail?: string;
  landlordEmail?: string;
  landlordMobile?: string;
  tenantPhone?: string;
  rehearsal?: boolean;
  propertyLat?: number | null;
  propertyLng?: number | null;
  title: string;
  description?: string;
  category: string;
  urgency?: Urgency | null;
  dueAt?: string | null;
  reportedBy?: string;
  access?: string;
  authorityPence?: number;
  contractorId?: string | null;
  scheduledAt?: string | null;
  /** Every tenant on the home who goes on the works order. */
  tenants?: JobTenant[];
  /** The landlord is not involved and hears nothing. */
  landlordSkipped?: boolean;
  /** With a contractor: the works order goes to them as the job is raised. */
  send?: boolean;
  /** A repair: false keeps every automatic tenant email off (a discreet job).
   *  A planned job: true tells the tenants who will be in touch about access. */
  tellTenants?: boolean;
}

/** Repairs: the urgency sets the date. Planned: the caller says when. */
export function dueFor(kind: Kind, urgency: Urgency | null | undefined, dueAt: string | null | undefined, from = Date.now()): string | null {
  if (kind === "planned") return dueAt ?? null;
  const u = URGENCIES.find((x) => x.id === (urgency ?? "routine")) ?? URGENCIES[2];
  return new Date(from + u.hours * 3600000).toISOString();
}

export async function createOrder(input: NewOrder, by: string): Promise<WorksOrder> {
  const id = uid();
  const kind: Kind = KINDS.includes(input.kind) ? input.kind : "repair";
  const urgency = kind === "repair" ? (URGENCIES.some((u) => u.id === input.urgency) ? (input.urgency as Urgency) : "routine") : null;
  const dueAt = dueFor(kind, urgency, input.dueAt);
  let contractorName = "";
  if (input.contractorId) {
    const [c] = await q<Row>(`SELECT name FROM os_contractors WHERE id = $1`, [input.contractorId]);
    contractorName = s(c?.name);
  }
  /* Planned maintenance is ours to arrange (James, 8 Oct 2026): there is no
     "tell the landlord, who's arranging it" stage on a gas safety. Sent as it
     is raised, the works order is out and the contractor is on it - the next
     thing is the date, which they set from their page or we type in.
     A repair sent as it is raised is ours too (Lianna, 9 Oct 2026); it still
     asks for the landlord to be told unless they were skipped (lib/works-steps). */
  const planned = kind === "planned";
  const sent = !!input.contractorId && input.send === true;
  const skipped = input.landlordSkipped === true;
  const quiet = kind === "repair" && input.tellTenants === false;
  const accessNotice = planned && input.tellTenants === true;
  /* Already booked with them is already confirmed. */
  const confirmed = sent || (planned && !!input.contractorId && !!input.scheduledAt);
  /* A job with a contractor and a date already has its booking; one without
     is reported and waits. Approval only ever bites on a quote. */
  const status: Status = input.contractorId && input.scheduledAt ? "scheduled" : sent ? "approved" : "reported";
  const tenants = cleanTenants(input.tenants);
  const now = new Date();
  const [r] = await q<Row>(
    `INSERT INTO os_works_orders
       (id, kind, status, property_id, property_name, locality, landlord, tenant, tenant_email, landlord_email, title, description, category, urgency, due_at,
        reported_by, raised_by, contractor_id, contractor_name, scheduled_at, access, authority_pence,
        landlord_mobile, contractor_token, tenant_token, property_lat, property_lng, rehearsal, tenant_phone,
        arranging, contractor_contacted_at, contractor_confirmed_at, tenants, landlord_skipped, quiet_tenants, tenants_access_notice)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29,
        $30, $31, $32, $33::jsonb, $34, $35, $36)
     RETURNING ${COLS}`,
    [
      id, kind, status, input.propertyId ?? null, input.propertyName.trim(), (input.locality ?? "").trim(), (input.landlord ?? "").trim(),
      (input.tenant ?? "").trim(), (input.tenantEmail ?? "").trim().toLowerCase(), skipped ? "" : (input.landlordEmail ?? "").trim().toLowerCase(),
      input.title.trim(), (input.description ?? "").trim(), input.category, urgency, dueAt,
      (input.reportedBy ?? "Agent").trim(), by, input.contractorId ?? null, contractorName, input.scheduledAt ?? null,
      (input.access ?? "").trim(), Number.isFinite(input.authorityPence) ? Number(input.authorityPence) : DEFAULT_AUTHORITY_PENCE,
      skipped ? "" : (input.landlordMobile ?? "").trim(), randomBytes(16).toString("base64url"), randomBytes(16).toString("base64url"),
      input.propertyLat ?? null, input.propertyLng ?? null, input.rehearsal === true, (input.tenantPhone ?? "").trim(),
      planned || sent ? "us" : null, sent ? now : null, confirmed ? now : null, JSON.stringify(tenants), skipped, quiet, accessNotice,
    ]
  );
  const order = toOrder(r);
  await logEvent(order.id, by, "raised", `${kind === "repair" ? `${URGENCIES.find((u) => u.id === urgency)?.label ?? "Routine"} repair` : "Planned job"} raised: ${order.title}. Reported by ${order.reportedBy}.`);
  if (skipped) await logEvent(order.id, by, "note", "Landlord skipped: they are not involved in this job and are not emailed about it.");
  if (quiet) await logEvent(order.id, by, "note", "Discreet job: the tenants are not emailed about it.");
  if (sent && status !== "scheduled") await logEvent(order.id, by, "contacted", `Works order sent to ${contractorName} with the job and ${tenants.length === 2 ? "both tenants'" : tenants.length > 2 ? `all ${tenants.length} tenants'` : "the tenant's"} details, to arrange a date.`);
  if (status === "scheduled") await logEvent(order.id, by, "scheduled", `Booked with ${contractorName} for ${when(input.scheduledAt)}.`);
  return order;
}

export async function getOrder(id: string): Promise<{ order: WorksOrder; events: WorksEvent[] } | null> {
  if (!hasDb()) return null;
  const [r] = await q<Row>(`SELECT ${COLS} FROM os_works_orders WHERE id = $1`, [id]);
  if (!r) return null;
  const events = (await q<Row>(`SELECT id, order_id, at, by_name, kind, text FROM os_works_order_events WHERE order_id = $1 ORDER BY at DESC`, [id])).map((e) => ({
    id: s(e.id), orderId: s(e.order_id), at: iso(e.at)!, by: s(e.by_name), kind: s(e.kind), text: s(e.text),
  }));
  const [quoteAsks, chase] = await Promise.all([asksFor(id), chaseOf(id)]);
  return { order: { ...toOrder(r), quoteAsks, chase }, events };
}

export async function listOrders(filter: { kind?: Kind | null; open?: boolean; propertyId?: string | null; tenantEmail?: string | null; limit?: number; rehearsal?: boolean } = {}): Promise<WorksOrder[]> {
  if (!hasDb()) return [];
  /* A rehearsal is never on the real list, and a real job is never on the
     rehearsal's. Asked for explicitly, never inferred. */
  const where: string[] = [filter.rehearsal ? "rehearsal" : "NOT rehearsal"];
  const vals: unknown[] = [];
  if (filter.kind) { vals.push(filter.kind); where.push(`kind = $${vals.length}`); }
  if (filter.open) where.push(`status IN ('reported', 'approval', 'approved', 'scheduled')`);
  if (filter.propertyId) { vals.push(filter.propertyId); where.push(`property_id = $${vals.length}`); }
  /* The tenant's own jobs, for their portal. Matched on the address they were
     raised against rather than an id, because a tenant's record carries the
     address and not a REX property id - and compared lowercased, because the
     same mailbox arrives capitalised differently depending on who typed it. */
  if (filter.tenantEmail) { vals.push(filter.tenantEmail.toLowerCase()); where.push(`LOWER(tenant_email) = $${vals.length}`); }
  vals.push(filter.limit ?? 300);
  const rows = await q<Row>(
    `SELECT ${COLS} FROM os_works_orders ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY CASE status WHEN 'reported' THEN 0 WHEN 'approval' THEN 1 WHEN 'approved' THEN 2 WHEN 'scheduled' THEN 3 WHEN 'done' THEN 4 WHEN 'invoiced' THEN 5 WHEN 'paid' THEN 6 ELSE 7 END,
               due_at ASC NULLS LAST, created_at DESC
      LIMIT $${vals.length}`,
    vals
  );
  return rows.map(toOrder);
}

export interface WorksSummary {
  open: number;
  overdue: number;
  emergencies: number;
  awaitingLandlord: number;
  bookedThisWeek: number;
  invoicedUnpaidPence: number;
  byKind: { repair: number; planned: number };
}

export async function worksSummary(): Promise<WorksSummary> {
  const empty: WorksSummary = { open: 0, overdue: 0, emergencies: 0, awaitingLandlord: 0, bookedThisWeek: 0, invoicedUnpaidPence: 0, byKind: { repair: 0, planned: 0 } };
  if (!hasDb()) return empty;
  const [r] = await q<Row>(
    `SELECT count(*) FILTER (WHERE status IN ('reported','approval','approved','scheduled')) AS open,
            count(*) FILTER (WHERE status IN ('reported','approval','approved','scheduled') AND (
              CASE WHEN kind = 'planned'
                /* A planned job's due DATE is late once that UK day is over (Rig run 4, P-041). */
                THEN (due_at AT TIME ZONE 'Europe/London')::date < (NOW() AT TIME ZONE 'Europe/London')::date
                ELSE due_at < NOW() END)) AS overdue,
            count(*) FILTER (WHERE status IN ('reported','approval','approved','scheduled') AND urgency = 'emergency') AS emergencies,
            count(*) FILTER (WHERE status = 'approval') AS awaiting,
            count(*) FILTER (WHERE status = 'scheduled' AND scheduled_at >= date_trunc('week', NOW()) AND scheduled_at < date_trunc('week', NOW()) + interval '7 days') AS booked_week,
            coalesce(sum(invoice_pence) FILTER (WHERE status = 'invoiced'), 0) AS unpaid,
            count(*) FILTER (WHERE status IN ('reported','approval','approved','scheduled') AND kind = 'repair') AS repairs,
            count(*) FILTER (WHERE status IN ('reported','approval','approved','scheduled') AND kind = 'planned') AS planned
       FROM os_works_orders WHERE NOT rehearsal`
  );
  return {
    open: Number(r?.open ?? 0), overdue: Number(r?.overdue ?? 0), emergencies: Number(r?.emergencies ?? 0), awaitingLandlord: Number(r?.awaiting ?? 0),
    bookedThisWeek: Number(r?.booked_week ?? 0), invoicedUnpaidPence: Number(r?.unpaid ?? 0),
    byKind: { repair: Number(r?.repairs ?? 0), planned: Number(r?.planned ?? 0) },
  };
}

/* ── moving a job along ─────────────────────────────────────────────────── */

export type Move =
  /* ── the workflow ── */
  | { action: "tell_landlord"; how: "rang" | "emailed" | "both" | "text"; note?: string }
  /* Planned jobs: the booking goes to the tenants only when the agent says so. */
  | { action: "tell_tenants_booked"; note?: string }
  | { action: "arranging"; who: "landlord" | "us"; followUpAt?: string | null; note?: string }
  | { action: "landlord_resolved"; note?: string }
  | { action: "contact_contractor"; contractorId: string; note?: string }
  | { action: "contractor_confirmed"; note?: string }
  | { action: "tenant_happy"; happy: "yes" | "no"; note?: string }
  | { action: "payee"; payee: "contractor" | "agent"; note?: string }
  /* Skip for now (Howard, 15 Oct 2026): only the current step, only a SKIPPABLE one. Sends nothing. */
  | { action: "skip_step"; step: SkippableStep; note?: string }
  /* ── the sheet ── */
  | { action: "quote"; quotePence: number; note?: string }
  | { action: "approve"; approvedBy: string; note?: string }
  /** quiet: set them on the job and send nothing (the job page's Change the Contractor says so); Send again sends it. */
  | { action: "assign"; contractorId: string; scheduledAt?: string | null; note?: string; quiet?: boolean }
  | { action: "schedule"; scheduledAt: string; note?: string }
  /** alreadyDone: work finished before it was on the OS - nobody is emailed and the tenant is not asked (Rhiannon, 19 Oct 2026). */
  | { action: "done"; note: string; completedAt?: string | null; alreadyDone?: boolean }
  | { action: "invoice"; invoicePence: number; invoiceRef?: string; note?: string }
  | { action: "paid"; paidHow: PaidHow; note?: string }
  | { action: "cancel"; reason: string }
  | { action: "reopen"; note?: string }
  | { action: "note"; note: string }
  | { action: "edit"; fields: Partial<Pick<WorksOrder, "title" | "description" | "category" | "urgency" | "dueAt" | "tenant" | "tenantPhone" | "tenantEmail" | "landlord" | "landlordEmail" | "landlordMobile" | "access" | "authorityPence" | "reportedBy">> }
  /** contractor: whose quote it is, when several were asked (it isn't always the job's contractor). */
  | { action: "file"; file: { key: string; name: string; type: string; kind?: "invoice" | "quote"; contractor?: string } }
  /** Ask for a quote before any works order goes (Sean, 20 Oct 2026). Several
   *  contractors at once, each with their own link (Sean, 21 Oct 2026). */
  | { action: "request_quote"; contractorId?: string; contractorIds?: string[]; note?: string }
  /** The same request to the same contractor again, on their own link. */
  | { action: "resend_quote"; askId: string; note?: string }
  /** One contractor's price, from their link or keyed in off their reply. */
  | { action: "ask_quote_in"; askId: string; quotePence: number; note?: string }
  /** They can't do it (Forth, 21 Oct 2026: too far). */
  | { action: "ask_declined"; askId: string; note?: string }
  /** Take this one: they go on the job, the others are told politely. */
  | { action: "accept_quote"; askId: string; note?: string }
  /** The works order again, to whoever is on the job now. */
  | { action: "resend_order"; note?: string }
  /** Send the invoice to the landlord to authorise (Kirstie Mulholland, 20 Oct 2026). */
  | { action: "ask_landlord_invoice"; email?: string; note?: string }
  /** The landlord's answer: from their link, or recorded by the agent after a call. */
  | { action: "landlord_invoice"; answer: LandlordInvoiceAnswer; note?: string }
  /** On the payment run (James, 21 Oct 2026): the office keyed the invoice on
   *  PayProp. Office only (the route checks). payrun_undo takes it back off. */
  | { action: "payrun"; note?: string }
  | { action: "payrun_undo"; note?: string };

export const pounds = (pence: number | null | undefined) =>
  pence == null ? "—" : `£${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: pence % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

const when = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "a date to be agreed";

/** Compliance have been told the job is done: stamped so it only ever goes once. */
export async function markComplianceTold(id: string): Promise<void> {
  if (!hasDb()) return;
  await q(`UPDATE os_works_orders SET compliance_told_at = NOW() WHERE id = $1`, [id]).catch(() => {});
}

/** Accounts have the invoice: stamped when the email actually went. */
export async function markAccountsTold(id: string): Promise<void> {
  if (!hasDb()) return;
  await q(`UPDATE os_works_orders SET accounts_told_at = NOW() WHERE id = $1`, [id]).catch(() => {});
}

/** What a move did to the quote requests, for the emails that follow it. */
export interface MoveOut {
  /** Each contractor to be sent the quote request now. */
  asks?: QuoteAsk[];
  /** Asked, still in the running, and now told another was taken. */
  closed?: QuoteAsk[];
  /** A quote became the job's quote, so the landlord may need to approve it. */
  quoted?: boolean;
}

const freshToken = () => randomBytes(16).toString("base64url");
const listNames = (names: string[]) => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

export async function moveOrder(id: string, move: Move, by: string, out: MoveOut = {}): Promise<WorksOrder> {
  const cur = await getOrder(id);
  if (!cur) throw new Error("No such job.");
  const o = cur.order;
  const sets: string[] = [];
  const vals: unknown[] = [];
  const set = (col: string, v: unknown) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
  let eventKind: string = move.action;
  let text = "";
  /* The job's quote. Over the landlord's authority it waits on them; under
     it, it is approved on the spot, and the job says so. */
  const applyQuote = (pence: number) => {
    set("quote_pence", Math.round(pence));
    const over = pence > o.authorityPence;
    if (["reported", "approval", "approved"].includes(o.status)) {
      set("status", over ? "approval" : "approved");
      if (!over) { set("approved_by", "Within the landlord's authority"); set("approved_at", new Date()); }
    }
    out.quoted = true;
    return `${pounds(pence)}${over ? `, over the landlord's authority of ${pounds(o.authorityPence)} - waiting on them` : `, within the landlord's authority of ${pounds(o.authorityPence)}`}`;
  };
  /* One contractor's quote taken: they go on the job (with a fresh link if
     they weren't on it), and everyone else still in the running is closed. */
  const take = async (a: QuoteAsk) => {
    if (a.contractorId !== o.contractorId) {
      set("contractor_id", a.contractorId);
      set("contractor_name", a.contractorName);
      set("contractor_token", freshToken());
    }
    const said = applyQuote(a.quotePence ?? 0);
    out.closed = await acceptAsk(a.id, o.id);
    return `It's the job's quote: ${said}.${out.closed.length ? ` ${listNames(out.closed.map((c) => c.contractorName))} ${out.closed.length === 1 ? "is" : "are"} thanked and told it's gone elsewhere.` : ""}`;
  };

  switch (move.action) {
    case "tell_landlord": {
      set("landlord_told_at", new Date());
      text = `Landlord told - ${move.how === "both" ? "rang and emailed" : move.how === "rang" ? "rang them" : move.how === "text" ? "texted them" : "emailed the report"}.${move.note ? ` ${move.note}` : ""}`;
      break;
    }
    case "tell_tenants_booked": {
      if (!o.scheduledAt) throw new Error("There is no date to tell them yet.");
      const told = tenantsOf(o).filter((t) => t.email.includes("@"));
      if (!told.length) throw new Error("No tenant on this job has an email address.");
      set("tenants_told_booked_at", new Date());
      eventKind = "note";
      text = `Booking confirmation to ${told.length === 1 ? (told[0].name || "the tenant") : told.length === 2 ? "both tenants" : `all ${told.length} tenants`}.${move.note ? ` ${move.note}` : ""}`;
      break;
    }
    case "arranging": {
      set("arranging", move.who);
      if (move.who === "landlord") {
        set("landlord_follow_up_at", move.followUpAt ? new Date(move.followUpAt) : new Date(Date.now() + 3 * 86400000));
        set("status", "approved");
      }
      text = move.who === "landlord" ? `The landlord is organising it with their own people. Follow up ${when(move.followUpAt ?? new Date(Date.now() + 3 * 86400000).toISOString())}.` : "We're arranging it.";
      if (move.note) text += ` ${move.note}`;
      break;
    }
    case "landlord_resolved": {
      set("landlord_resolved_at", new Date());
      set("status", "done");
      set("completed_at", new Date());
      set("completion_note", move.note?.trim() || "Resolved by the landlord's own contractor.");
      text = `Resolved by the landlord.${move.note ? ` ${move.note}` : ""}`;
      break;
    }
    case "contact_contractor": {
      const [c] = await q<Row>(`SELECT name FROM os_contractors WHERE id = $1`, [move.contractorId]);
      if (!c) throw new Error("No such contractor.");
      set("contractor_id", move.contractorId);
      set("contractor_name", s(c.name));
      /* A new firm gets a new link: the old one's works order no longer opens the job. */
      if (o.contractorId && o.contractorId !== move.contractorId) set("contractor_token", freshToken());
      set("contractor_contacted_at", new Date());
      set("contractor_confirmed_at", null);
      eventKind = "contacted";
      text = `${s(c.name)} contacted about the job.${move.note ? ` ${move.note}` : ""}`;
      break;
    }
    case "contractor_confirmed": {
      if (!o.contractorId) throw new Error("Pick a contractor first.");
      set("contractor_confirmed_at", new Date());
      if (o.status === "reported" || o.status === "approved") set("status", o.scheduledAt ? "scheduled" : "approved");
      text = `${o.contractorName} confirmed they'll take it. Works order out; tenant told to expect their call.${move.note ? ` ${move.note}` : ""}`;
      break;
    }
    case "tenant_happy": {
      set("tenant_happy", move.happy);
      set("tenant_happy_at", new Date());
      set("tenant_happy_note", (move.note ?? "").trim());
      text = move.happy === "yes" ? `The tenant is happy with the work.${move.note ? ` ${move.note}` : ""}` : `The tenant is NOT happy: ${move.note?.trim() || "no detail given"}. Back with the agent.`;
      break;
    }
    case "skip_step": {
      if (!isSkippable(move.step)) throw new Error("That step can't be skipped.");
      if (stepOfOrder(o) !== move.step) throw new Error("That isn't the step the job is on.");
      set("skipped_steps", JSON.stringify([...new Set([...o.skippedSteps, move.step])]));
      eventKind = "skipped";
      text = `${skippedLine(move.step)}${move.note?.trim() ? ` ${move.note.trim()}` : ""}`;
      break;
    }
    case "payee": {
      set("payee", move.payee);
      text = move.payee === "agent" ? `To be paid to the agent, who paid the contractor themselves.${move.note ? ` ${move.note}` : ""}` : `To be paid to ${o.contractorName || "the contractor"}.${move.note ? ` ${move.note}` : ""}`;
      break;
    }
    case "request_quote": {
      const ids = [...new Set(move.contractorIds?.length ? move.contractorIds : [move.contractorId || o.contractorId || ""])].filter(Boolean);
      if (!ids.length) throw new Error("Pick a contractor to ask.");
      if (ids.length > 8) throw new Error("Up to eight contractors at a time.");
      const rows = await q<Row>(`SELECT id, name FROM os_contractors WHERE id = ANY($1)`, [ids]);
      if (rows.length !== ids.length) throw new Error("No such contractor.");
      const named = ids.map((cid) => ({ id: cid, name: s(rows.find((r) => s(r.id) === cid)?.name) }));
      /* More quotes after one was taken, and before any works order went:
         the comparison opens again. The one taken goes back to quoted, so it
         sits beside the new ones rather than being lost. */
      const reopening = o.quotePence != null && !o.contractorConfirmedAt && ["reported", "approval", "approved"].includes(o.status);
      if (reopening) {
        set("quote_pence", null);
        set("approved_by", "");
        set("approved_at", null);
        set("status", "reported");
        await q(`UPDATE os_works_quote_asks SET outcome = NULL, outcome_at = NULL WHERE order_id = $1 AND outcome = 'accepted'`, [o.id]);
      }
      const before = new Map(o.quoteAsks.map((a) => [a.contractorId, a]));
      const asks = await upsertAsks(o.id, named, by);
      out.asks = asks;
      /* The job's contractor while it is out for quotes: the one firm asked,
         or nobody until a quote is taken. */
      const live = (await asksFor(o.id)).filter(isLive);
      const onJob = live.length === 1 ? live[0] : null;
      if ((onJob?.contractorId ?? null) !== o.contractorId) {
        set("contractor_id", onJob?.contractorId ?? null);
        set("contractor_name", onJob?.contractorName ?? "");
      }
      /* The job's own link is for the works order. Asked before 21 Oct, the
         quote went out on it; from here each firm answers on theirs. */
      if ((onJob?.contractorId ?? null) !== o.contractorId || !o.quoteAsks.length) set("contractor_token", freshToken());
      set("quote_requested_at", new Date());
      /* Asking our contractor for a price is us arranging it. */
      if (!o.arranging) set("arranging", "us");
      eventKind = "quote_requested";
      const fresh = asks.filter((a) => !before.has(a.contractorId)).map((a) => a.contractorName);
      const again = asks.filter((a) => before.has(a.contractorId)).map((a) => a.contractorName);
      const legacy = !o.quoteAsks.length && o.quoteRequestedAt && fresh.length === 1 && fresh[0] === o.contractorName;
      text = [
        fresh.length ? `Asked ${listNames(fresh)} for a quote${legacy ? " again" : ""}.` : "",
        again.length ? `Asked ${listNames(again)} again.` : "",
        reopening ? "The quote that was taken goes back beside the new ones." : "",
        "No works order goes until a quote is approved.",
      ].filter(Boolean).join(" ") + (move.note ? ` ${move.note}` : "");
      break;
    }
    case "resend_quote": {
      const a = await askById(move.askId);
      if (!a || a.orderId !== o.id) throw new Error("No such quote request.");
      if (!isLive(a)) throw new Error(a.state === "declined" ? `${a.contractorName} said they can't do it. Ask them again from Ask for quotes if that's changed.` : "That one is decided.");
      out.asks = [await resendAsk(a.id)];
      set("quote_requested_at", new Date());
      eventKind = "quote_requested";
      text = `Sent the quote request to ${a.contractorName} again.${move.note ? ` ${move.note}` : ""}`;
      break;
    }
    case "ask_quote_in": {
      const a = await askById(move.askId);
      if (!a || a.orderId !== o.id) throw new Error("No such quote request.");
      if (a.outcome) throw new Error(a.outcome === "accepted" ? "Their quote has already been taken. Change it on the job instead." : "Another quote has been taken for this job.");
      if (!Number.isFinite(move.quotePence) || move.quotePence <= 0) throw new Error("A quote needs a figure.");
      const got = await recordAskQuote(a.id, move.quotePence, move.note ?? "", by);
      eventKind = "quote";
      text = `${a.contractorName} quoted ${pounds(got.quotePence)}.${move.note ? ` ${move.note}` : ""}`;
      /* The only one still in the running: no comparison to make, so it is
         taken as the single request always was (Forth said no, All Trade
         quoted - All Trade's is the quote). */
      const others = o.quoteAsks.filter((x) => x.id !== a.id && isLive(x));
      if (!others.length) text += ` ${await take(got)}`;
      else text += ` ${others.length === 1 ? `${others[0].contractorName} is` : `${others.length} others are`} still in the running.`;
      break;
    }
    case "ask_declined": {
      const a = await askById(move.askId);
      if (!a || a.orderId !== o.id) throw new Error("No such quote request.");
      if (a.outcome) throw new Error("That one is decided.");
      await declineAsk(a.id, move.note ?? "");
      const live = o.quoteAsks.filter((x) => x.id !== a.id && isLive(x));
      if (o.contractorId === a.contractorId) {
        set("contractor_id", live.length === 1 ? live[0].contractorId : null);
        set("contractor_name", live.length === 1 ? live[0].contractorName : "");
        set("contractor_token", freshToken());
      }
      eventKind = "quote";
      text = `${a.contractorName} can't do it${move.note?.trim() ? `: ${move.note.trim().replace(/\.+$/, "")}` : ""}.${live.length ? "" : " Nobody else is asked yet."}`;
      break;
    }
    case "accept_quote": {
      const a = await askById(move.askId);
      if (!a || a.orderId !== o.id) throw new Error("No such quote request.");
      if (a.quotePence == null) throw new Error(`There's no price from ${a.contractorName} yet.`);
      if (!isLive(a)) throw new Error("That one is decided.");
      eventKind = "quote";
      text = `Took the quote from ${a.contractorName}. ${await take(a)}${move.note ? ` ${move.note}` : ""}`;
      break;
    }
    case "resend_order": {
      if (!o.contractorId) throw new Error("There's no contractor on the job to send it to.");
      if (stepOfOrder(o) === "quote") throw new Error("The job is out for quotes. Send the quote request again instead.");
      if (!OPEN_STATUSES.includes(o.status)) throw new Error("The job is closed.");
      eventKind = "contacted";
      text = `Works order sent to ${o.contractorName}${o.orderSentTo && o.orderSentTo !== o.contractorId ? `, in place of ${o.orderSentToName || "the last contractor"}` : " again"}.${move.note ? ` ${move.note}` : ""}`;
      break;
    }
    case "quote": {
      if (!Number.isFinite(move.quotePence) || move.quotePence < 0) throw new Error("A quote needs a figure.");
      text = `Quote ${applyQuote(move.quotePence)}.${move.note ? ` ${move.note}` : ""}`;
      break;
    }
    case "approve": {
      if (!move.approvedBy.trim()) throw new Error("Say who approved it.");
      set("approved_by", move.approvedBy.trim());
      set("approved_at", new Date());
      if (["reported", "approval"].includes(o.status)) set("status", o.contractorId && o.scheduledAt ? "scheduled" : "approved");
      /* A landlord who has said yes to the quote knows about the job. */
      if (o.quoteRequestedAt && !o.landlordToldAt) set("landlord_told_at", new Date());
      text = `Approved by ${move.approvedBy.trim()}.${move.note ? ` ${move.note}` : ""}`;
      break;
    }
    case "assign": {
      const [c] = await q<Row>(`SELECT name FROM os_contractors WHERE id = $1`, [move.contractorId]);
      if (!c) throw new Error("No such contractor.");
      set("contractor_id", move.contractorId);
      set("contractor_name", s(c.name));
      if (o.contractorId && o.contractorId !== move.contractorId) set("contractor_token", freshToken());
      if (move.scheduledAt) set("scheduled_at", new Date(move.scheduledAt));
      if (o.status !== "approval" && OPEN_STATUSES.includes(o.status)) set("status", move.scheduledAt || o.scheduledAt ? "scheduled" : "approved");
      eventKind = move.scheduledAt ? "scheduled" : "assigned";
      text = move.scheduledAt ? `Booked with ${s(c.name)} for ${when(move.scheduledAt)}.` : `Assigned to ${s(c.name)}.`;
      if (move.quiet && o.orderSentTo && o.orderSentTo !== move.contractorId) text += ` Not emailed: the works order went to ${o.orderSentToName || "the last contractor"}, so send it to ${s(c.name)} when you're ready.`;
      if (move.note) text += ` ${move.note}`;
      break;
    }
    case "schedule": {
      if (!move.scheduledAt) throw new Error("A booking needs a date.");
      set("scheduled_at", new Date(move.scheduledAt));
      if (o.status !== "approval" && OPEN_STATUSES.includes(o.status)) set("status", "scheduled");
      text = `Booked for ${when(move.scheduledAt)}${o.contractorName ? ` with ${o.contractorName}` : ""}.${move.note ? ` ${move.note}` : ""}`;
      break;
    }
    case "done": {
      if (!move.note.trim()) throw new Error("Say what was done.");
      set("status", "done");
      set("completed_at", move.completedAt ? new Date(move.completedAt) : new Date());
      set("completion_note", move.note.trim());
      if (move.alreadyDone) set("skipped_steps", JSON.stringify([...new Set([...o.skippedSteps, "aftercare"])]));
      text = move.alreadyDone ? `Already done before it was on the OS. ${move.note.trim()}` : `Done. ${move.note.trim()}`;
      break;
    }
    case "invoice": {
      if (!Number.isFinite(move.invoicePence) || move.invoicePence < 0) throw new Error("An invoice needs a figure.");
      set("invoice_pence", Math.round(move.invoicePence));
      set("invoice_ref", (move.invoiceRef ?? "").trim());
      set("invoiced_at", new Date());
      if (["done", "invoiced"].includes(o.status)) set("status", "invoiced");
      text = `Invoice ${pounds(move.invoicePence)}${move.invoiceRef ? ` (${move.invoiceRef.trim()})` : ""}${o.contractorName ? ` from ${o.contractorName}` : ""}.${move.note ? ` ${move.note}` : ""}`;
      break;
    }
    case "ask_landlord_invoice": {
      if (o.invoicePence == null) throw new Error("Put the invoice on the job first, so the landlord sees the figure.");
      /* A job logged straight off a contractor's invoice carries no landlord
         email (it is raised with the landlord skipped), so the ask can bring one. */
      const email = (move.email ?? "").trim().toLowerCase();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("That email address doesn't look right.");
      if (email) { set("landlord_email", email); o.landlordEmail = email; }
      if (!o.landlordEmail.includes("@")) throw new Error("There's no email for the landlord on this job. Type it in, or ring them and record their answer.");
      if (!o.landlordInvoiceToken) set("landlord_invoice_token", randomBytes(18).toString("base64url"));
      set("landlord_invoice_asked_at", new Date());
      /* Asking again starts a fresh question: a query answered on the phone
         and the invoice sent back is a new ask, not the old answer. */
      set("landlord_invoice_answer", null);
      set("landlord_invoice_answered_at", null);
      set("landlord_invoice_note", "");
      set("landlord_invoice_by", "");
      eventKind = "note";
      text = `Invoice ${pounds(o.invoicePence)} sent to the landlord to authorise.${move.note ? ` ${move.note}` : ""}`;
      break;
    }
    case "landlord_invoice": {
      const a = LANDLORD_INVOICE_ANSWERS.find((x) => x.id === move.answer);
      if (!a) throw new Error("Which answer?");
      const note = (move.note ?? "").trim().slice(0, 2000);
      if (a.id === "query" && !note) throw new Error("Say what the query is.");
      set("landlord_invoice_answer", a.id);
      set("landlord_invoice_answered_at", new Date());
      set("landlord_invoice_note", note);
      set("landlord_invoice_by", by);
      eventKind = "note";
      text = `${a.line}${by === LANDLORD_SELF ? "" : ` (recorded by ${by})`}.${note ? ` "${note}"` : ""}`;
      break;
    }
    /* On the payment run (James, 21 Oct 2026): "they don't know whether it's
       been processed, so they don't know whether it's going to get paid".
       The office says so once it is keyed on PayProp; the agent sees it.
       PayProp is read-only to the OS - this records the fact, nothing more.
       Mark paid still works from invoiced either way. */
    case "payrun": {
      if (o.invoicePence == null || !["done", "invoiced"].includes(o.status)) throw new Error("Only an invoice waiting to be paid can go on the payment run.");
      if (o.payrunAt) throw new Error("It's already on the payment run.");
      set("payrun_at", new Date());
      set("payrun_by", by);
      eventKind = "note";
      text = `On the payment run: keyed on PayProp by ${by}, ${pounds(o.invoicePence)} to come out of the rent.${move.note ? ` ${move.note}` : ""}`;
      break;
    }
    case "payrun_undo": {
      if (!o.payrunAt) throw new Error("It isn't on the payment run.");
      if (o.status === "paid") throw new Error("It's already paid.");
      set("payrun_at", null);
      set("payrun_by", "");
      eventKind = "note";
      text = `Taken off the payment run.${move.note ? ` ${move.note}` : ""}`;
      break;
    }
    case "paid": {
      const how = PAID_HOW.find((h) => h.id === move.paidHow);
      if (!how) throw new Error("Say how it was paid.");
      set("paid_at", new Date());
      set("paid_how", how.id);
      set("status", "paid");
      text = `Paid: ${how.label.charAt(0).toLowerCase()}${how.label.slice(1)}.${move.note ? ` ${move.note}` : ""}`;
      break;
    }
    case "cancel": {
      if (!move.reason.trim()) throw new Error("Say why.");
      set("status", "cancelled");
      set("cancelled_reason", move.reason.trim());
      text = `Cancelled: ${move.reason.trim()}`;
      break;
    }
    case "reopen": {
      set("status", o.contractorId && o.scheduledAt ? "scheduled" : "reported");
      set("cancelled_reason", "");
      text = `Reopened.${move.note ? ` ${move.note}` : ""}`;
      break;
    }
    case "note": {
      if (!move.note.trim()) throw new Error("An empty note.");
      text = move.note.trim();
      break;
    }
    case "edit": {
      const f = move.fields;
      if (f.title != null) set("title", f.title.trim());
      if (f.description != null) set("description", f.description.trim());
      if (f.category != null) set("category", f.category);
      if (f.urgency !== undefined && o.kind === "repair") { set("urgency", f.urgency); set("due_at", dueFor("repair", f.urgency, null, new Date(o.reportedAt).getTime())); }
      if (f.dueAt !== undefined && o.kind === "planned") set("due_at", f.dueAt ? new Date(f.dueAt) : null);
      if (f.tenant != null) set("tenant", f.tenant.trim());
      if (f.tenantEmail != null) set("tenant_email", f.tenantEmail.trim().toLowerCase());
      if (f.landlord != null) set("landlord", f.landlord.trim());
      if (f.landlordEmail != null) set("landlord_email", f.landlordEmail.trim().toLowerCase());
      if (f.landlordMobile != null) set("landlord_mobile", f.landlordMobile.trim());
      if (f.tenantPhone != null) set("tenant_phone", f.tenantPhone.trim());
      if (f.access != null) set("access", f.access.trim());
      if (f.reportedBy != null) set("reported_by", f.reportedBy.trim());
      if (f.authorityPence != null && Number.isFinite(f.authorityPence)) set("authority_pence", Math.round(f.authorityPence));
      text = "Details updated.";
      break;
    }
    case "file": {
      const files = [...o.files, { ...move.file, at: new Date().toISOString(), by }];
      /* An invoice keeps its kind, so the accounts email can attach it. */
      set("files", JSON.stringify(files));
      text = `File added: ${move.file.name}.`;
      break;
    }
  }

  if (sets.length) {
    vals.push(id);
    await q(`UPDATE os_works_orders SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $${vals.length}`, vals);
  }
  await logEvent(id, by, eventKind, text);
  /* Every file on a job also goes on the home's Documents (James, 19 Oct
     2026): the contractor's report, photos and invoice belong to the
     property, not only to the job. Whoever added it - the agent on the
     sheet, the contractor from their link - it lands the same way. A
     walkthrough job's files stay on the walkthrough. Best effort: the file
     is already on the job if this fails. */
  if (move.action === "file" && !o.rehearsal) {
    const address = [o.propertyName, o.locality].filter(Boolean).join(", ");
    const invoice = move.file.kind === "invoice";
    const quote = move.file.kind === "quote";
    await addFileDoc({
      home: { address, propertyId: o.propertyId },
      from: { kind: "job", id: o.id },
      type: invoice ? "contractor_invoice" : OTHER_DOC,
      name: invoice
        ? `Invoice${o.contractorName ? ` - ${o.contractorName}` : ""} (job #${o.ref})`
        : quote
          ? `Quote${move.file.contractor || o.contractorName ? ` - ${move.file.contractor || o.contractorName}` : ""} (job #${o.ref})`
          : `Job #${o.ref} - ${move.file.name}`,
      fileName: move.file.name,
      r2Key: move.file.key,
      mime: move.file.type || "application/octet-stream",
      sizeBytes: 0,
      by: { id: "", name: by },
      isTest: TEST_STREET.test(address),
    }).catch(() => null);
  }
  const next = await getOrder(id);
  /* The contractor came back, or the job moved on: any chase stops here, the
     moment it happens (Sean McMahon, 26 Oct 2026). Best effort. */
  if (o.chase && !o.chase.stoppedAt) {
    await stopChaseOnMove(o, next!.order, move.action, move.action === "file" ? move.file : null, by).catch(() => null);
    return (await getOrder(id))!.order;
  }
  return next!.order;
}

export async function logEvent(orderId: string, by: string, kind: string, text: string): Promise<void> {
  await q(`INSERT INTO os_works_order_events (id, order_id, by_name, kind, text) VALUES ($1, $2, $3, $4, $5)`, [uid(), orderId, by, kind, text]).catch(() => null);
}

/* ── the two public doors ───────────────────────────────────────────────── */

/** Who answered from the landlord's own link, for the timeline. */
export const LANDLORD_SELF = "The landlord";

export async function orderByToken(kind: "contractor" | "tenant" | "landlord_invoice", token: string): Promise<WorksOrder | null> {
  /* A token we could never have issued is not asked of Postgres (Rig run 4,
     P-048): a null byte in one was an empty 500 instead of "not one of ours". */
  if (!hasDb() || !token || token.length > 200 || /[\u0000-\u001f]/.test(token)) return null;
  const [r] = await q<Row>(`SELECT ${COLS} FROM os_works_orders WHERE ${kind === "contractor" ? "contractor_token" : kind === "tenant" ? "tenant_token" : "landlord_invoice_token"} = $1`, [token]);
  return r ? toOrder(r) : null;
}

/* ── which contractor, for this job ─────────────────────────────────────── */

/** What each category wants. Loose words, matched against the trade as typed. */
const TRADE_WORDS: Record<string, string[]> = {
  Plumbing: ["plumb", "heating", "gas"],
  "Heating & boiler": ["heating", "gas", "boiler", "plumb"],
  Electrical: ["electric", "niceic", "napit", "spark"],
  Gas: ["gas", "heating"],
  Appliance: ["appliance", "electric", "engineer"],
  "Roof & gutters": ["roof", "gutter", "builder"],
  "Windows & doors": ["glaz", "window", "door", "joiner", "carpent", "locksmith"],
  "Locks & security": ["lock", "security"],
  "Damp & mould": ["damp", "mould", "builder", "decorat"],
  Decoration: ["decorat", "paint"],
  Flooring: ["floor", "carpet"],
  "Garden & fences": ["garden", "fenc", "landscap"],
  Pests: ["pest"],
  Cleaning: ["clean"],
  Structural: ["builder", "structural", "survey"],
  "Gas safety (CP12)": ["gas"],
  EICR: ["electric", "niceic", "napit"],
  EPC: ["epc", "energy", "assessor"],
  "Boiler service": ["gas", "heating", "boiler"],
  "Legionella risk assessment": ["legionella", "water", "assessor"],
  "PAT test": ["pat", "electric"],
  "Smoke & CO alarms": ["alarm", "electric", "fire"],
  "Fire risk assessment": ["fire", "assessor"],
  "HMO licence inspection": ["inspect", "hmo"],
  "Property inspection": ["inspect", "inventory"],
  "Inventory & check-in": ["inventory", "check"],
  "Check-out": ["inventory", "check"],
};

const milesBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

export interface RankedContractor extends Contractor {
  /** Their trade fits the job. */
  fits: boolean;
  /** Miles from the property, when both sides are placed. */
  miles: number | null;
  lat: number | null;
  lng: number | null;
}

/** The book for one job: those whose trade fits first, nearest first within that. */
export async function contractorsFor(order: WorksOrder, forUserId: string): Promise<RankedContractor[]> {
  if (!hasDb()) return [];
  const rows = await q<Row>(`SELECT * FROM os_contractors WHERE active AND rehearsal = $2 AND (owner_id IS NULL OR owner_id = $1)`, [forUserId, order.rehearsal]);
  /* A boiler service and an EPC on one job: a contractor fits on either trade. */
  const words = [...new Set(categoriesOf(order.category).flatMap((c) => TRADE_WORDS[c] ?? []))];
  const here = order.propertyLat != null && order.propertyLng != null ? { lat: order.propertyLat, lng: order.propertyLng } : null;
  return rows
    .map((r) => {
      const c = toContractor(r);
      const lat = n(r.lat), lng = n(r.lng);
      const trade = c.trade.toLowerCase();
      return {
        ...c,
        lat, lng,
        fits: words.length === 0 || words.some((w) => trade.includes(w)),
        miles: here && lat != null && lng != null ? Math.round(milesBetween(here, { lat, lng }) * 10) / 10 : null,
      };
    })
    .sort((a, b) => Number(b.fits) - Number(a.fits) || (a.miles ?? 9999) - (b.miles ?? 9999) || a.name.localeCompare(b.name));
}

/** The works order went to this contractor: stamped by the email itself, so a failed send leaves it unstamped. */
export async function markOrderSent(id: string, contractorId: string, name: string): Promise<void> {
  if (!hasDb()) return;
  await q(`UPDATE os_works_orders SET order_sent_to = $2, order_sent_to_name = $3 WHERE id = $1`, [id, contractorId, name]).catch(() => {});
}

/** Place a contractor from their address, so distance can be read. */
export async function placeContractor(id: string, lat: number, lng: number): Promise<void> {
  await q(`UPDATE os_contractors SET lat = $2, lng = $3 WHERE id = $1`, [id, lat, lng]).catch(() => null);
}
