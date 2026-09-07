import "server-only";
import { randomBytes } from "node:crypto";
import { hasDb, q } from "@/lib/db";
import { uid } from "@/lib/auth";

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

export const KINDS = ["repair", "planned"] as const;
export type Kind = (typeof KINDS)[number];

export const URGENCIES = [
  { id: "emergency", label: "Emergency", within: "24 hours", hours: 24, blurb: "No heating in winter, a burst pipe, no power, a security risk." },
  { id: "urgent", label: "Urgent", within: "3 days", hours: 72, blurb: "Something broken that makes the home hard to live in." },
  { id: "routine", label: "Routine", within: "14 days", hours: 24 * 14, blurb: "Everything else." },
] as const;
export type Urgency = (typeof URGENCIES)[number]["id"];

export const REPAIR_CATEGORIES = [
  "Plumbing", "Heating & boiler", "Electrical", "Gas", "Appliance", "Roof & gutters", "Windows & doors", "Locks & security", "Damp & mould",
  "Decoration", "Flooring", "Garden & fences", "Pests", "Cleaning", "Structural", "Other",
] as const;

export const PLANNED_CATEGORIES = [
  "Gas safety (CP12)", "EICR", "EPC", "Boiler service", "Legionella risk assessment", "PAT test", "Smoke & CO alarms", "Fire risk assessment",
  "HMO licence inspection", "Property inspection", "Inventory & check-in", "Check-out", "Other",
] as const;

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
  /** Gas Safe number, NICEIC number, whatever the trade carries. */
  registration: string;
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
  tenant: string;
  /** Where the step emails go. Blank means nobody is told, and the timeline says so. */
  tenantEmail: string;
  landlordEmail: string;
  landlordMobile: string;
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
  files: { key: string; name: string; type: string; at: string; by: string }[];
  createdAt: string;
  updatedAt: string;
}

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
    tenantEmail: s(r.tenant_email),
    landlordEmail: s(r.landlord_email),
    landlordMobile: s(r.landlord_mobile),
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

const COLS = `id, ref, kind, status, property_id, property_name, locality, landlord, tenant, tenant_email, landlord_email, landlord_mobile,
  landlord_told_at, arranging, landlord_follow_up_at, landlord_resolved_at, contractor_contacted_at, contractor_confirmed_at, landlord_arranged_at,
  tenant_happy, tenant_happy_at, tenant_happy_note, payee, contractor_token, tenant_token, property_lat, property_lng, accounts_told_at,
  title, description, category, urgency,
  due_at, reported_by, reported_at, raised_by, contractor_id, contractor_name, scheduled_at, access, authority_pence, quote_pence,
  approved_by, approved_at, completed_at, completion_note, invoice_pence, invoice_ref, invoiced_at, paid_at, paid_how,
  cancelled_reason, files, rehearsal, created_at, updated_at`;

/* ── contractors ────────────────────────────────────────────────────────── */

function toContractor(r: Row): Contractor {
  return {
    id: s(r.id), name: s(r.name), contact: s(r.contact), trade: s(r.trade), phone: s(r.phone), email: s(r.email), website: s(r.website), address: s(r.address),
    registration: s(r.registration), notes: s(r.notes), active: r.active !== false, ownerId: r.owner_id ? s(r.owner_id) : null, createdBy: s(r.created_by),
  };
}

/** The company's contractors and this person's own. Nobody else's. */
export async function listContractors(forUserId?: string | null): Promise<Contractor[]> {
  if (!hasDb()) return [];
  return (
    await q<Row>(`SELECT * FROM os_contractors WHERE NOT rehearsal AND (owner_id IS NULL OR owner_id = $1) ORDER BY active DESC, (owner_id IS NULL), trade, name`, [forUserId ?? ""])
  ).map(toContractor);
}

export async function getContractor(id: string): Promise<Contractor | null> {
  if (!hasDb()) return null;
  const [r] = await q<Row>(`SELECT * FROM os_contractors WHERE id = $1`, [id]);
  return r ? toContractor(r) : null;
}

export async function saveContractor(input: Partial<Contractor> & { name: string; trade: string }, by: string): Promise<Contractor> {
  const id = input.id || uid();
  const [r] = await q<Row>(
    `INSERT INTO os_contractors (id, name, contact, trade, phone, email, website, address, registration, notes, active, owner_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (id) DO UPDATE SET name = $2, contact = $3, trade = $4, phone = $5, email = $6, website = $7, address = $8, registration = $9, notes = $10, active = $11, owner_id = $12, updated_at = NOW()
     RETURNING *`,
    [
      id, input.name.trim(), (input.contact ?? "").trim(), input.trade.trim(), (input.phone ?? "").trim(), (input.email ?? "").trim().toLowerCase(),
      (input.website ?? "").trim(), (input.address ?? "").trim(), (input.registration ?? "").trim(), (input.notes ?? "").trim(), input.active !== false,
      input.ownerId ?? null, by,
    ]
  );
  return toContractor(r);
}

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
  /* A job with a contractor and a date already has its booking; one without
     is reported and waits. Approval only ever bites on a quote. */
  const status: Status = input.contractorId && input.scheduledAt ? "scheduled" : "reported";
  const [r] = await q<Row>(
    `INSERT INTO os_works_orders
       (id, kind, status, property_id, property_name, locality, landlord, tenant, tenant_email, landlord_email, title, description, category, urgency, due_at,
        reported_by, raised_by, contractor_id, contractor_name, scheduled_at, access, authority_pence,
        landlord_mobile, contractor_token, tenant_token, property_lat, property_lng, rehearsal)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)
     RETURNING ${COLS}`,
    [
      id, kind, status, input.propertyId ?? null, input.propertyName.trim(), (input.locality ?? "").trim(), (input.landlord ?? "").trim(),
      (input.tenant ?? "").trim(), (input.tenantEmail ?? "").trim().toLowerCase(), (input.landlordEmail ?? "").trim().toLowerCase(),
      input.title.trim(), (input.description ?? "").trim(), input.category, urgency, dueAt,
      (input.reportedBy ?? "Agent").trim(), by, input.contractorId ?? null, contractorName, input.scheduledAt ?? null,
      (input.access ?? "").trim(), Number.isFinite(input.authorityPence) ? Number(input.authorityPence) : DEFAULT_AUTHORITY_PENCE,
      (input.landlordMobile ?? "").trim(), randomBytes(16).toString("base64url"), randomBytes(16).toString("base64url"),
      input.propertyLat ?? null, input.propertyLng ?? null, input.rehearsal === true,
    ]
  );
  const order = toOrder(r);
  await logEvent(order.id, by, "raised", `${kind === "repair" ? `${URGENCIES.find((u) => u.id === urgency)?.label ?? "Routine"} repair` : "Planned job"} raised: ${order.title}. Reported by ${order.reportedBy}.`);
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
  return { order: toOrder(r), events };
}

export async function listOrders(filter: { kind?: Kind | null; open?: boolean; propertyId?: string | null; limit?: number; rehearsal?: boolean } = {}): Promise<WorksOrder[]> {
  if (!hasDb()) return [];
  /* A rehearsal is never on the real list, and a real job is never on the
     rehearsal's. Asked for explicitly, never inferred. */
  const where: string[] = [filter.rehearsal ? "rehearsal" : "NOT rehearsal"];
  const vals: unknown[] = [];
  if (filter.kind) { vals.push(filter.kind); where.push(`kind = $${vals.length}`); }
  if (filter.open) where.push(`status IN ('reported', 'approval', 'approved', 'scheduled')`);
  if (filter.propertyId) { vals.push(filter.propertyId); where.push(`property_id = $${vals.length}`); }
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
            count(*) FILTER (WHERE status IN ('reported','approval','approved','scheduled') AND due_at < NOW()) AS overdue,
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
  | { action: "arranging"; who: "landlord" | "us"; followUpAt?: string | null; note?: string }
  | { action: "landlord_resolved"; note?: string }
  | { action: "contact_contractor"; contractorId: string; note?: string }
  | { action: "contractor_confirmed"; note?: string }
  | { action: "tenant_happy"; happy: "yes" | "no"; note?: string }
  | { action: "payee"; payee: "contractor" | "agent"; note?: string }
  /* ── the sheet ── */
  | { action: "quote"; quotePence: number; note?: string }
  | { action: "approve"; approvedBy: string; note?: string }
  | { action: "assign"; contractorId: string; scheduledAt?: string | null; note?: string }
  | { action: "schedule"; scheduledAt: string; note?: string }
  | { action: "done"; note: string; completedAt?: string | null }
  | { action: "invoice"; invoicePence: number; invoiceRef?: string; note?: string }
  | { action: "paid"; paidHow: PaidHow; note?: string }
  | { action: "cancel"; reason: string }
  | { action: "reopen"; note?: string }
  | { action: "note"; note: string }
  | { action: "edit"; fields: Partial<Pick<WorksOrder, "title" | "description" | "category" | "urgency" | "dueAt" | "tenant" | "tenantEmail" | "landlord" | "landlordEmail" | "landlordMobile" | "access" | "authorityPence" | "reportedBy">> }
  | { action: "file"; file: { key: string; name: string; type: string } };

export const pounds = (pence: number | null | undefined) =>
  pence == null ? "—" : `£${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: pence % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

const when = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "a date to be agreed";

/** Accounts have the invoice: stamped when the email actually went. */
export async function markAccountsTold(id: string): Promise<void> {
  if (!hasDb()) return;
  await q(`UPDATE os_works_orders SET accounts_told_at = NOW() WHERE id = $1`, [id]).catch(() => {});
}

export async function moveOrder(id: string, move: Move, by: string): Promise<WorksOrder> {
  const cur = await getOrder(id);
  if (!cur) throw new Error("No such job.");
  const o = cur.order;
  const sets: string[] = [];
  const vals: unknown[] = [];
  const set = (col: string, v: unknown) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
  let eventKind: string = move.action;
  let text = "";

  switch (move.action) {
    case "tell_landlord": {
      set("landlord_told_at", new Date());
      text = `Landlord told - ${move.how === "both" ? "rang and emailed" : move.how === "rang" ? "rang them" : move.how === "text" ? "texted them" : "emailed the report"}.${move.note ? ` ${move.note}` : ""}`;
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
    case "payee": {
      set("payee", move.payee);
      text = move.payee === "agent" ? `To be paid to the agent, who paid the contractor themselves.${move.note ? ` ${move.note}` : ""}` : `To be paid to ${o.contractorName || "the contractor"}.${move.note ? ` ${move.note}` : ""}`;
      break;
    }
    case "quote": {
      if (!Number.isFinite(move.quotePence) || move.quotePence < 0) throw new Error("A quote needs a figure.");
      set("quote_pence", Math.round(move.quotePence));
      /* Over the landlord's authority it waits on them; under it, it is
         approved on the spot, and the job says so. */
      const over = move.quotePence > o.authorityPence;
      if (["reported", "approval", "approved"].includes(o.status)) {
        set("status", over ? "approval" : "approved");
        if (!over) { set("approved_by", "Within the landlord's authority"); set("approved_at", new Date()); }
      }
      text = `Quote ${pounds(move.quotePence)}${over ? `, over the landlord's authority of ${pounds(o.authorityPence)} - waiting on them` : `, within the landlord's authority of ${pounds(o.authorityPence)}`}.${move.note ? ` ${move.note}` : ""}`;
      break;
    }
    case "approve": {
      if (!move.approvedBy.trim()) throw new Error("Say who approved it.");
      set("approved_by", move.approvedBy.trim());
      set("approved_at", new Date());
      if (["reported", "approval"].includes(o.status)) set("status", o.contractorId && o.scheduledAt ? "scheduled" : "approved");
      text = `Approved by ${move.approvedBy.trim()}.${move.note ? ` ${move.note}` : ""}`;
      break;
    }
    case "assign": {
      const [c] = await q<Row>(`SELECT name FROM os_contractors WHERE id = $1`, [move.contractorId]);
      if (!c) throw new Error("No such contractor.");
      set("contractor_id", move.contractorId);
      set("contractor_name", s(c.name));
      if (move.scheduledAt) set("scheduled_at", new Date(move.scheduledAt));
      if (o.status !== "approval" && OPEN_STATUSES.includes(o.status)) set("status", move.scheduledAt || o.scheduledAt ? "scheduled" : "approved");
      eventKind = move.scheduledAt ? "scheduled" : "assigned";
      text = move.scheduledAt ? `Booked with ${s(c.name)} for ${when(move.scheduledAt)}.` : `Assigned to ${s(c.name)}.`;
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
      text = `Done. ${move.note.trim()}`;
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
      if (f.access != null) set("access", f.access.trim());
      if (f.reportedBy != null) set("reported_by", f.reportedBy.trim());
      if (f.authorityPence != null && Number.isFinite(f.authorityPence)) set("authority_pence", Math.round(f.authorityPence));
      text = "Details updated.";
      break;
    }
    case "file": {
      const files = [...o.files, { ...move.file, at: new Date().toISOString(), by }];
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
  const next = await getOrder(id);
  return next!.order;
}

export async function logEvent(orderId: string, by: string, kind: string, text: string): Promise<void> {
  await q(`INSERT INTO os_works_order_events (id, order_id, by_name, kind, text) VALUES ($1, $2, $3, $4, $5)`, [uid(), orderId, by, kind, text]).catch(() => null);
}

/* ── the two public doors ───────────────────────────────────────────────── */

export async function orderByToken(kind: "contractor" | "tenant", token: string): Promise<WorksOrder | null> {
  if (!hasDb() || !token) return null;
  const [r] = await q<Row>(`SELECT ${COLS} FROM os_works_orders WHERE ${kind === "contractor" ? "contractor_token" : "tenant_token"} = $1`, [token]);
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
  const words = TRADE_WORDS[order.category] ?? [];
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

/** Place a contractor from their address, so distance can be read. */
export async function placeContractor(id: string, lat: number, lng: number): Promise<void> {
  await q(`UPDATE os_contractors SET lat = $2, lng = $3 WHERE id = $1`, [id, lat, lng]).catch(() => null);
}
