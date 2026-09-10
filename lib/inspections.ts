import "server-only";
import { randomBytes } from "node:crypto";
import { hasDb, q } from "@/lib/db";
import { uid } from "@/lib/auth";
import { stepOf, type StepId } from "@/lib/inspection-steps";
import type { ManagedProperty } from "@/lib/portfolio-types";

/**
 * Inspections: every visit we make to a home we manage, and the permission
 * that let us in.
 *
 * James, 10 Sep 2026: "track, record, ask for permissions for access to the
 * tenant, and log when all of these things need to be done." Those are four
 * jobs and this file does them in that order:
 *
 *   DUE      dueList() reads the managed book, works out from the cadence
 *            when each home is next owed a visit, and subtracts the ones
 *            already booked or done. Computed at read time against now(),
 *            never stored - a schedule written down once is a schedule that
 *            is wrong by the following month.
 *   PERMISSION  the tenant is asked in writing, offered dates, and answers
 *            for themselves through a link of their own. The ask and the
 *            answer are both rows with timestamps, because "did they let us
 *            in?" is a question that gets asked a year later by somebody
 *            who is not on our side.
 *   RECORD   the visit, the condition, the findings room by room, photos.
 *   ACTIONS  a finding that needs work becomes a works order, linked back.
 *
 * ── What is deliberately not decided here ────────────────────────────────
 *
 * The CADENCE. Three months then every six is the usual shape of it, and it
 * is a guess until Michael says otherwise, so it lives in os_settings under
 * "inspections" and every number the schedule uses is read from there. When
 * he answers, somebody edits a settings document; nobody edits this file and
 * nobody deploys.
 */

/* ── what kinds of visit there are ───────────────────────────────────────── */

export const KINDS = [
  { id: "check_in", label: "Check-in", blurb: "The inventory and the condition at the start, signed by the tenant." },
  { id: "interim", label: "Property visit", blurb: "The routine visit through the tenancy. How the home is being kept, and what needs doing." },
  { id: "hmo", label: "HMO check", blurb: "A licensed house in multiple occupation, on its own tighter cycle." },
  { id: "void", label: "Empty property check", blurb: "Nobody living there. Water, heating, security, post." },
  { id: "check_out", label: "Check-out", blurb: "The condition against the inventory at the end, and the deposit case." },
  { id: "follow_up", label: "Re-visit", blurb: "Going back to see that something found last time was put right." },
] as const;
export type Kind = (typeof KINDS)[number]["id"];
export const KIND_IDS = KINDS.map((k) => k.id) as readonly Kind[];
export const kindLabel = (k: string) => KINDS.find((x) => x.id === k)?.label ?? "Visit";

export const STATUSES = [
  { id: "due", label: "Due", blurb: "The cadence says it is time. Nothing arranged yet." },
  { id: "arranging", label: "Arranging", blurb: "The tenant has been asked, or has to be asked again." },
  { id: "booked", label: "Booked", blurb: "Permission given and a date in the diary." },
  { id: "visited", label: "Visited", blurb: "We have been. The report is still to write." },
  { id: "reported", label: "Reported", blurb: "Written up and with the landlord." },
  { id: "no_access", label: "No access", blurb: "We could not get in. It has to be arranged again." },
  { id: "closed", label: "Closed", blurb: "Done, with every action raised." },
  { id: "cancelled", label: "Cancelled", blurb: "Not going ahead." },
] as const;
export type Status = (typeof STATUSES)[number]["id"];
export const OPEN_STATUSES: Status[] = ["due", "arranging", "booked", "visited", "reported", "no_access"];

/** How we get in. Notice is owed on all three - only the last one is a key in a lockbox. */
export const ACCESS_METHODS = [
  { id: "tenant_present", label: "The tenant lets us in", blurb: "They are there. The usual, and the easiest to evidence." },
  { id: "keys", label: "We hold keys", blurb: "Written permission first, every time. Keys are not consent." },
  { id: "landlord", label: "The landlord is there", blurb: "Their own visit, with us or instead of us." },
] as const;
export type AccessMethod = (typeof ACCESS_METHODS)[number]["id"];

/** What the tenant said. "other_time" is a yes to the visit and a no to the dates. */
export type AccessReply = "yes" | "no" | "other_time";

export const CONDITIONS = ["good", "fair", "poor"] as const;
export type Condition = (typeof CONDITIONS)[number];

/** What a finding asks for next. */
export const ACTIONS = [
  { id: "none", label: "Nothing needed" },
  { id: "monitor", label: "Watch it next time" },
  { id: "works_order", label: "Raise a works order" },
  { id: "tenant", label: "The tenant to put right" },
  { id: "landlord", label: "The landlord to put right" },
] as const;
export type FindingAction = (typeof ACTIONS)[number]["id"];

/** The rooms an inspection walks, as a starting list. Anything can be typed in. */
export const ROOMS = [
  "Outside", "Hallway", "Living room", "Kitchen", "Dining room", "Bedroom 1", "Bedroom 2", "Bedroom 3",
  "Bathroom", "En-suite", "WC", "Loft", "Garage", "Garden", "Communal areas", "Meters & alarms",
] as const;

/* ── the cadence, and where it is decided ────────────────────────────────── */

export interface InspectionRules {
  /** Months after the tenancy starts before the first property visit. */
  firstAfterMonths: number;
  /** And every this-many months after that. */
  thenEveryMonths: number;
  /** A licensed HMO on its own cycle. */
  hmoEveryMonths: number;
  /** An empty home, checked this often while it stands empty. */
  voidEveryMonths: number;
  /** The notice we give as standard, in hours. 24 is the statutory floor. */
  noticeHours: number;
  /** How many dates the tenant is offered to choose from. */
  offerSlots: number;
  /** How many days before it is due a visit starts appearing on the board. */
  leadDays: number;
  /** Which REX service types we inspect. Let Only is the landlord's own job. */
  services: string[];
  /** Set when a person last changed these, so the screen can say so. */
  updatedAt: string | null;
  updatedBy: string;
}

export const DEFAULT_RULES: InspectionRules = {
  firstAfterMonths: 3,
  thenEveryMonths: 6,
  hmoEveryMonths: 3,
  voidEveryMonths: 1,
  noticeHours: 24,
  offerSlots: 3,
  leadDays: 28,
  services: ["Managed", "Fully Managed", "Rent Collect"],
  updatedAt: null,
  updatedBy: "",
};

const RULES_KEY = "inspections";

export async function inspectionRules(): Promise<InspectionRules> {
  if (!hasDb()) return DEFAULT_RULES;
  const rows = await q<{ value: Partial<InspectionRules> | null; updated_at: string; updated_by: string }>(
    `SELECT value, updated_at, updated_by FROM os_settings WHERE key = $1`,
    [RULES_KEY]
  ).catch(() => []);
  const held = rows[0];
  if (!held) return DEFAULT_RULES;
  return {
    ...DEFAULT_RULES,
    ...(held.value ?? {}),
    updatedAt: held.updated_at ? new Date(held.updated_at).toISOString() : null,
    updatedBy: held.updated_by ?? "",
  };
}

export async function saveInspectionRules(patch: Partial<InspectionRules>, by: string): Promise<InspectionRules> {
  const next = { ...(await inspectionRules()), ...patch };
  const { updatedAt: _a, updatedBy: _b, ...value } = next;
  await q(
    `INSERT INTO os_settings (key, value, updated_by) VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = NOW(), updated_by = $3`,
    [RULES_KEY, JSON.stringify(value), by]
  );
  return inspectionRules();
}

/* ── the record ──────────────────────────────────────────────────────────── */

export interface Inspection {
  id: string;
  ref: number;
  kind: Kind;
  status: Status;
  propertyId: string | null;
  osPropertyId: string | null;
  listingId: string | null;
  propertyName: string;
  locality: string;
  landlord: string;
  landlordEmail: string;
  tenant: string;
  tenantEmail: string;
  tenantPhone: string;
  tenancyStart: string | null;
  dueAt: string | null;
  noticeHours: number;
  accessMethod: AccessMethod;
  /** The dates put in front of the tenant, ISO, in the order they were offered. */
  offered: string[];
  accessToken: string | null;
  accessAskedAt: string | null;
  accessReply: AccessReply | null;
  accessRepliedAt: string | null;
  accessNote: string;
  bookedAt: string | null;
  tenantConfirmedAt: string | null;
  landlordToldAt: string | null;
  inspectorId: string | null;
  inspector: string;
  visitedAt: string | null;
  noAccessAt: string | null;
  noAccessReason: string;
  condition: Condition | null;
  summary: string;
  reportedAt: string | null;
  reportSentAt: string | null;
  closedAt: string | null;
  cancelledReason: string;
  files: { key: string; name: string; type: string; at: string; by: string }[];
  raisedBy: string;
  rehearsal: boolean;
  createdAt: string;
  updatedAt: string;
  /** Derived, never stored. Filled by the store so a list can show it. */
  openActions?: number;
  step?: StepId;
}

export interface Finding {
  id: string;
  inspectionId: string;
  room: string;
  item: string;
  condition: Condition;
  note: string;
  action: FindingAction;
  responsible: "tenant" | "landlord" | "agent" | null;
  worksOrderId: string | null;
  photos: { key: string; name: string }[];
  createdAt: string;
  createdBy: string;
}

export interface InspectionEvent {
  id: string;
  inspectionId: string;
  at: string;
  by: string;
  kind: string;
  text: string;
}

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v));
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const day = (v: unknown) => (v ? new Date(v as string).toISOString().slice(0, 10) : null);

function toInspection(r: Row): Inspection {
  return {
    id: s(r.id),
    ref: Number(r.ref ?? 0),
    kind: (s(r.kind) as Kind) || "interim",
    status: (s(r.status) as Status) || "due",
    propertyId: r.property_id ? s(r.property_id) : null,
    osPropertyId: r.os_property_id ? s(r.os_property_id) : null,
    listingId: r.listing_id ? s(r.listing_id) : null,
    propertyName: s(r.property_name),
    locality: s(r.locality),
    landlord: s(r.landlord),
    landlordEmail: s(r.landlord_email),
    tenant: s(r.tenant),
    tenantEmail: s(r.tenant_email),
    tenantPhone: s(r.tenant_phone),
    tenancyStart: day(r.tenancy_start),
    dueAt: iso(r.due_at),
    noticeHours: Number(r.notice_hours ?? 24),
    accessMethod: (s(r.access_method) as AccessMethod) || "tenant_present",
    offered: Array.isArray(r.offered) ? (r.offered as string[]) : [],
    accessToken: r.access_token ? s(r.access_token) : null,
    accessAskedAt: iso(r.access_asked_at),
    accessReply: r.access_reply ? (s(r.access_reply) as AccessReply) : null,
    accessRepliedAt: iso(r.access_replied_at),
    accessNote: s(r.access_note),
    bookedAt: iso(r.booked_at),
    tenantConfirmedAt: iso(r.tenant_confirmed_at),
    landlordToldAt: iso(r.landlord_told_at),
    inspectorId: r.inspector_id ? s(r.inspector_id) : null,
    inspector: s(r.inspector),
    visitedAt: iso(r.visited_at),
    noAccessAt: iso(r.no_access_at),
    noAccessReason: s(r.no_access_reason),
    condition: r.condition ? (s(r.condition) as Condition) : null,
    summary: s(r.summary),
    reportedAt: iso(r.reported_at),
    reportSentAt: iso(r.report_sent_at),
    closedAt: iso(r.closed_at),
    cancelledReason: s(r.cancelled_reason),
    files: Array.isArray(r.files) ? (r.files as Inspection["files"]) : [],
    raisedBy: s(r.raised_by),
    rehearsal: r.rehearsal === true,
    createdAt: iso(r.created_at) ?? new Date().toISOString(),
    updatedAt: iso(r.updated_at) ?? new Date().toISOString(),
  };
}

function toFinding(r: Row): Finding {
  return {
    id: s(r.id),
    inspectionId: s(r.inspection_id),
    room: s(r.room),
    item: s(r.item),
    condition: (s(r.condition) as Condition) || "good",
    note: s(r.note),
    action: (s(r.action) as FindingAction) || "none",
    responsible: r.responsible === "tenant" || r.responsible === "landlord" || r.responsible === "agent" ? r.responsible : null,
    worksOrderId: r.works_order_id ? s(r.works_order_id) : null,
    photos: Array.isArray(r.photos) ? (r.photos as Finding["photos"]) : [],
    createdAt: iso(r.created_at) ?? new Date().toISOString(),
    createdBy: s(r.created_by),
  };
}

/** The step for a record, given how many of its findings are still waiting on a works order. */
export function withStep(i: Inspection, openActions: number): Inspection {
  return { ...i, openActions, step: stepOf({ ...i, openActions }) };
}

/* ── reading ─────────────────────────────────────────────────────────────── */

async function openActionCounts(ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!hasDb() || ids.length === 0) return out;
  const rows = await q<{ inspection_id: string; n: string }>(
    `SELECT inspection_id, COUNT(*)::text AS n FROM os_inspection_findings
      WHERE inspection_id = ANY($1::text[]) AND action IN ('works_order', 'tenant', 'landlord') AND (works_order_id IS NULL OR works_order_id = '')
      GROUP BY inspection_id`,
    [ids]
  ).catch(() => []);
  for (const r of rows) out.set(r.inspection_id, Number(r.n));
  return out;
}

export async function listInspections(opts: { kind?: Kind | null; open?: boolean; propertyId?: string | null; rehearsal?: boolean } = {}): Promise<Inspection[]> {
  if (!hasDb()) return [];
  const where: string[] = [opts.rehearsal ? `rehearsal` : `NOT rehearsal`];
  const args: unknown[] = [];
  if (opts.kind) { args.push(opts.kind); where.push(`kind = $${args.length}`); }
  if (opts.propertyId) { args.push(opts.propertyId); where.push(`(property_id = $${args.length} OR os_property_id = $${args.length} OR listing_id = $${args.length})`); }
  if (opts.open) where.push(`status = ANY('{${OPEN_STATUSES.join(",")}}')`);
  const rows = await q<Row>(
    `SELECT * FROM os_inspections WHERE ${where.join(" AND ")} ORDER BY COALESCE(booked_at, due_at, created_at) ASC NULLS LAST`,
    args
  ).catch(() => []);
  const list = rows.map(toInspection);
  const counts = await openActionCounts(list.map((i) => i.id));
  return list.map((i) => withStep(i, counts.get(i.id) ?? 0));
}

export async function getInspection(id: string): Promise<{ inspection: Inspection; findings: Finding[]; events: InspectionEvent[] } | null> {
  if (!hasDb()) return null;
  const [r] = await q<Row>(`SELECT * FROM os_inspections WHERE id = $1`, [id]);
  if (!r) return null;
  const [fRows, eRows] = await Promise.all([
    q<Row>(`SELECT * FROM os_inspection_findings WHERE inspection_id = $1 ORDER BY created_at`, [id]).catch(() => []),
    q<Row>(`SELECT * FROM os_inspection_events WHERE inspection_id = $1 ORDER BY at DESC`, [id]).catch(() => []),
  ]);
  const findings = fRows.map(toFinding);
  const open = findings.filter((f) => ["works_order", "tenant", "landlord"].includes(f.action) && !f.worksOrderId).length;
  return {
    inspection: withStep(toInspection(r), open),
    findings,
    events: eRows.map((e) => ({ id: s(e.id), inspectionId: s(e.inspection_id), at: iso(e.at) ?? "", by: s(e.by_name), kind: s(e.kind), text: s(e.text) })),
  };
}

/** The tenant's own link. One token, one inspection, no session. */
export async function inspectionByToken(token: string): Promise<Inspection | null> {
  if (!hasDb() || !token) return null;
  const [r] = await q<Row>(`SELECT * FROM os_inspections WHERE access_token = $1`, [token]);
  return r ? toInspection(r) : null;
}

export async function logEvent(inspectionId: string, by: string, kind: string, text: string): Promise<void> {
  if (!hasDb()) return;
  await q(`INSERT INTO os_inspection_events (id, inspection_id, by_name, kind, text) VALUES ($1, $2, $3, $4, $5)`, [uid(), inspectionId, by, kind, text]).catch(() => {});
}

/* ── raising one ─────────────────────────────────────────────────────────── */

export interface NewInspection {
  kind: Kind;
  propertyName: string;
  locality?: string;
  propertyId?: string | null;
  osPropertyId?: string | null;
  listingId?: string | null;
  landlord?: string;
  landlordEmail?: string;
  tenant?: string;
  tenantEmail?: string;
  tenantPhone?: string;
  tenancyStart?: string | null;
  dueAt?: string | null;
  accessMethod?: AccessMethod;
  noticeHours?: number;
  rehearsal?: boolean;
}

export async function createInspection(input: NewInspection, by: string): Promise<Inspection> {
  if (!hasDb()) throw new Error("No database on this environment.");
  const rules = await inspectionRules();
  const id = uid();
  const [r] = await q<Row>(
    `INSERT INTO os_inspections
       (id, kind, status, property_id, os_property_id, listing_id, property_name, locality, landlord, landlord_email,
        tenant, tenant_email, tenant_phone, tenancy_start, due_at, notice_hours, access_method, access_token, raised_by, rehearsal)
     VALUES ($1,$2,'due',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     RETURNING *`,
    [
      id, input.kind, input.propertyId ?? null, input.osPropertyId ?? null, input.listingId ?? null,
      input.propertyName.trim(), (input.locality ?? "").trim(), (input.landlord ?? "").trim(), (input.landlordEmail ?? "").trim().toLowerCase(),
      (input.tenant ?? "").trim(), (input.tenantEmail ?? "").trim().toLowerCase(), (input.tenantPhone ?? "").trim(),
      input.tenancyStart ?? null, input.dueAt ?? null, input.noticeHours ?? rules.noticeHours,
      input.accessMethod ?? "tenant_present", randomBytes(16).toString("hex"), by, input.rehearsal === true,
    ]
  );
  const made = toInspection(r);
  await logEvent(id, by, "raised", `${kindLabel(made.kind)} raised for ${made.propertyName}${made.dueAt ? `, due ${new Date(made.dueAt).toLocaleDateString("en-GB")}` : ""}.`);
  return withStep(made, 0);
}

/* ── moving one along ────────────────────────────────────────────────────── */

export type Move =
  | { action: "ask_access"; offered: string[]; noticeHours?: number; accessMethod?: AccessMethod; note?: string }
  | { action: "access_reply"; reply: AccessReply; at?: string | null; note?: string; by?: string }
  | { action: "book"; at: string; inspectorId?: string | null; inspector?: string }
  | { action: "confirm" }
  | { action: "tell_landlord" }
  | { action: "visited"; at?: string; inspector?: string }
  | { action: "no_access"; reason: string }
  | { action: "report"; condition: Condition; summary: string }
  | { action: "report_sent" }
  | { action: "close" }
  | { action: "cancel"; reason: string }
  | { action: "reopen" }
  | { action: "edit"; patch: Partial<NewInspection> }
  | { action: "note"; text: string }
  | { action: "file"; file: { key: string; name: string; type: string } };

const setStatus = (status: Status) => status;

export async function moveInspection(id: string, move: Move, by: string): Promise<Inspection> {
  if (!hasDb()) throw new Error("No database on this environment.");
  const found = await getInspection(id);
  if (!found) throw new Error("No such inspection.");
  const now = new Date().toISOString();
  let sql = "";
  let args: unknown[] = [];
  let line = "";

  switch (move.action) {
    case "ask_access": {
      const offered = (move.offered ?? []).filter(Boolean).slice(0, 6);
      if (offered.length === 0) throw new Error("Offer the tenant at least one date.");
      sql = `UPDATE os_inspections SET status = $2, offered = $3::jsonb, notice_hours = $4, access_method = $5,
             access_asked_at = NOW(), access_reply = NULL, access_replied_at = NULL, access_note = $6,
             access_token = COALESCE(access_token, $7), no_access_at = NULL, no_access_reason = '', updated_at = NOW() WHERE id = $1 RETURNING *`;
      args = [id, setStatus("arranging"), JSON.stringify(offered), move.noticeHours ?? found.inspection.noticeHours, move.accessMethod ?? found.inspection.accessMethod, (move.note ?? "").trim(), randomBytes(16).toString("hex")];
      line = `Access asked of ${found.inspection.tenant || "the tenant"} - ${offered.length} date${offered.length === 1 ? "" : "s"} offered, ${move.noticeHours ?? found.inspection.noticeHours} hours notice.`;
      break;
    }
    case "access_reply": {
      const status = move.reply === "yes" ? "arranging" : "arranging";
      sql = `UPDATE os_inspections SET status = $2, access_reply = $3, access_replied_at = NOW(), access_note = $4,
             booked_at = COALESCE($5::timestamptz, booked_at), updated_at = NOW() WHERE id = $1 RETURNING *`;
      args = [id, setStatus(status as Status), move.reply, (move.note ?? "").trim(), move.reply === "yes" ? (move.at ?? null) : null];
      line =
        move.reply === "yes" ? `${move.by || found.inspection.tenant || "The tenant"} agreed to the visit${move.at ? ` on ${new Date(move.at).toLocaleString("en-GB")}` : ""}.`
        : move.reply === "other_time" ? `${move.by || found.inspection.tenant || "The tenant"} asked for a different time.${move.note ? ` "${move.note.trim()}"` : ""}`
        : `${move.by || found.inspection.tenant || "The tenant"} said no to the visit.${move.note ? ` "${move.note.trim()}"` : ""}`;
      break;
    }
    case "book":
      sql = `UPDATE os_inspections SET status = $2, booked_at = $3, inspector_id = $4, inspector = $5, tenant_confirmed_at = NULL, updated_at = NOW() WHERE id = $1 RETURNING *`;
      args = [id, setStatus("booked"), move.at, move.inspectorId ?? null, (move.inspector ?? by).trim()];
      line = `Booked for ${new Date(move.at).toLocaleString("en-GB")}${move.inspector ? `, ${move.inspector}` : ""}.`;
      break;
    case "confirm":
      sql = `UPDATE os_inspections SET tenant_confirmed_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *`;
      args = [id];
      /* "Marked as", not "was": the confirmation email can be refused - no
         address, the customer switch off - and the outcome line that follows
         on the timeline is what says whether it actually went. A line that
         claims the tenant has their notice when they have not is the one
         thing this record must never do. */
      line = "Marked as confirmed with the tenant.";
      break;
    case "tell_landlord":
      sql = `UPDATE os_inspections SET landlord_told_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *`;
      args = [id];
      line = "The landlord was told the visit is happening.";
      break;
    case "visited":
      sql = `UPDATE os_inspections SET status = $2, visited_at = COALESCE($3::timestamptz, NOW()), inspector = COALESCE(NULLIF($4, ''), inspector), no_access_at = NULL, updated_at = NOW() WHERE id = $1 RETURNING *`;
      args = [id, setStatus("visited"), move.at ?? null, (move.inspector ?? "").trim()];
      line = `Visited${move.inspector ? ` by ${move.inspector}` : ` by ${by}`}.`;
      break;
    case "no_access":
      sql = `UPDATE os_inspections SET status = $2, no_access_at = NOW(), no_access_reason = $3, booked_at = NULL, tenant_confirmed_at = NULL, updated_at = NOW() WHERE id = $1 RETURNING *`;
      args = [id, setStatus("no_access"), move.reason.trim()];
      line = `No access: ${move.reason.trim()}`;
      break;
    case "report":
      sql = `UPDATE os_inspections SET status = $2, condition = $3, summary = $4, reported_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *`;
      args = [id, setStatus("reported"), move.condition, move.summary.trim()];
      line = `Written up as ${move.condition}.`;
      break;
    case "report_sent":
      sql = `UPDATE os_inspections SET report_sent_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *`;
      args = [id];
      line = `Report marked as sent to ${found.inspection.landlord || "the landlord"}.`;
      break;
    case "close":
      sql = `UPDATE os_inspections SET status = $2, closed_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *`;
      args = [id, setStatus("closed")];
      line = "Closed.";
      break;
    case "cancel":
      sql = `UPDATE os_inspections SET status = $2, cancelled_reason = $3, updated_at = NOW() WHERE id = $1 RETURNING *`;
      args = [id, setStatus("cancelled"), move.reason.trim()];
      line = `Cancelled: ${move.reason.trim()}`;
      break;
    case "reopen":
      sql = `UPDATE os_inspections SET status = $2, closed_at = NULL, cancelled_reason = '', updated_at = NOW() WHERE id = $1 RETURNING *`;
      args = [id, setStatus("arranging")];
      line = "Reopened.";
      break;
    case "edit": {
      const p = move.patch ?? {};
      sql = `UPDATE os_inspections SET
               property_name = COALESCE(NULLIF($2, ''), property_name),
               locality      = COALESCE(NULLIF($3, ''), locality),
               landlord      = COALESCE(NULLIF($4, ''), landlord),
               landlord_email= COALESCE(NULLIF($5, ''), landlord_email),
               tenant        = COALESCE(NULLIF($6, ''), tenant),
               tenant_email  = COALESCE(NULLIF($7, ''), tenant_email),
               tenant_phone  = COALESCE(NULLIF($8, ''), tenant_phone),
               due_at        = COALESCE($9::timestamptz, due_at),
               tenancy_start = COALESCE($10::date, tenancy_start),
               access_method = COALESCE(NULLIF($11, ''), access_method),
               notice_hours  = COALESCE($12::int, notice_hours),
               updated_at = NOW()
             WHERE id = $1 RETURNING *`;
      args = [id, (p.propertyName ?? "").trim(), (p.locality ?? "").trim(), (p.landlord ?? "").trim(), (p.landlordEmail ?? "").trim(),
        (p.tenant ?? "").trim(), (p.tenantEmail ?? "").trim(), (p.tenantPhone ?? "").trim(), p.dueAt ?? null, p.tenancyStart ?? null,
        (p.accessMethod ?? "") as string, p.noticeHours ?? null];
      line = "Details edited.";
      break;
    }
    case "note":
      await logEvent(id, by, "note", move.text.trim());
      return (await getInspection(id))!.inspection;
    case "file":
      sql = `UPDATE os_inspections SET files = files || $2::jsonb, updated_at = NOW() WHERE id = $1 RETURNING *`;
      args = [id, JSON.stringify([{ ...move.file, at: now, by }])];
      line = `${move.file.name} put on the file.`;
      break;
    default:
      throw new Error("That isn't something an inspection does.");
  }

  const [r] = await q<Row>(sql, args);
  if (line) await logEvent(id, by, move.action, line);
  const after = await getInspection(id);
  return after ? after.inspection : withStep(toInspection(r), 0);
}

/* ── findings ────────────────────────────────────────────────────────────── */

export async function saveFinding(inspectionId: string, input: Partial<Finding> & { room: string }, by: string): Promise<Finding> {
  if (!hasDb()) throw new Error("No database on this environment.");
  const id = input.id || uid();
  const [r] = await q<Row>(
    `INSERT INTO os_inspection_findings (id, inspection_id, room, item, condition, note, action, responsible, works_order_id, photos, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)
     ON CONFLICT (id) DO UPDATE SET room = $3, item = $4, condition = $5, note = $6, action = $7, responsible = $8, works_order_id = $9, photos = $10::jsonb
     RETURNING *`,
    [id, inspectionId, input.room.trim(), (input.item ?? "").trim(), input.condition ?? "good", (input.note ?? "").trim(),
     input.action ?? "none", input.responsible ?? null, input.worksOrderId ?? null, JSON.stringify(input.photos ?? []), by]
  );
  return toFinding(r);
}

export async function deleteFinding(id: string): Promise<void> {
  if (!hasDb()) return;
  await q(`DELETE FROM os_inspection_findings WHERE id = $1`, [id]).catch(() => {});
}

/** Findings across the book that asked for work and have no works order yet. */
export async function openFindings(): Promise<(Finding & { propertyName: string; ref: number })[]> {
  if (!hasDb()) return [];
  const rows = await q<Row>(
    `SELECT f.*, i.property_name, i.ref FROM os_inspection_findings f
       JOIN os_inspections i ON i.id = f.inspection_id
      WHERE f.action IN ('works_order', 'tenant', 'landlord') AND (f.works_order_id IS NULL OR f.works_order_id = '') AND NOT i.rehearsal
      ORDER BY f.created_at DESC`
  ).catch(() => []);
  return rows.map((r) => ({ ...toFinding(r), propertyName: s(r.property_name), ref: Number(r.ref ?? 0) }));
}

/* ── what is due, worked out at read time ────────────────────────────────── */

export interface DueVisit {
  key: string;
  kind: Kind;
  listingId: string | null;
  propertyId: string | null;
  propertyName: string;
  locality: string;
  landlord: string;
  landlordEmail: string;
  tenant: string;
  tenantEmail: string;
  tenantPhone: string;
  tenancyStart: string | null;
  /** When this home is next owed a visit. */
  dueAt: string;
  /** Negative when it is already late. */
  daysAway: number;
  /** What the cadence counted from: the last visit we made, or the tenancy start. */
  since: string | null;
  why: string;
}

const addMonths = (from: Date, months: number) => {
  const d = new Date(from.getTime());
  d.setMonth(d.getMonth() + months);
  return d;
};

/**
 * When a home is next owed a visit.
 *
 * Counted from the LAST visit we actually made, and from the tenancy start
 * only when there has never been one - which is why the first interval and
 * the repeat interval are separate numbers. Nothing here reads a month or a
 * year literal: every date is measured against the clock at the moment of
 * the call, so the board rolls over on its own.
 */
export function nextDueFor(
  p: { letSince: string | null; hmo?: boolean; empty?: boolean },
  lastVisitAt: string | null,
  rules: InspectionRules
): { dueAt: string; since: string | null; why: string; kind: Kind } | null {
  /* `empty` is only ever passed in, never inferred from a missing tenant.
     REX has no tenant contact on about a quarter of the leased book, and
     reading that absence as an empty home would put a hundred occupied
     houses on a monthly void cycle and tell the agent nobody lives there. */
  const empty = p.empty === true;
  const kind: Kind = empty ? "void" : p.hmo ? "hmo" : "interim";
  const every = empty ? rules.voidEveryMonths : p.hmo ? rules.hmoEveryMonths : rules.thenEveryMonths;
  if (lastVisitAt) {
    const from = new Date(lastVisitAt);
    if (Number.isNaN(from.getTime())) return null;
    return { dueAt: addMonths(from, every).toISOString(), since: from.toISOString(), why: `${every} months since the last visit`, kind };
  }
  if (!p.letSince) return null;
  const start = new Date(p.letSince);
  if (Number.isNaN(start.getTime())) return null;
  const first = empty || p.hmo ? every : rules.firstAfterMonths;
  return { dueAt: addMonths(start, first).toISOString(), since: start.toISOString(), why: `${first} months after the tenancy started`, kind };
}

/**
 * The due board: every managed home the cadence says is owed a visit inside
 * the lead window, with the ones already in hand taken out.
 *
 * `properties` is the managed book as Portfolio has it; `existing` is every
 * inspection the OS holds. Nothing is written - a due row is a fact about
 * today, and it becomes a record only when somebody raises it.
 */
export function dueList(
  properties: ManagedProperty[],
  existing: Inspection[],
  rules: InspectionRules,
  /** REX property ids the OS knows to be licensed HMOs - lib/os-properties has them. */
  hmoIds: Set<string> = new Set(),
  now: Date = new Date()
): DueVisit[] {
  const inspectable = (p: ManagedProperty) => !p.service || rules.services.some((x) => x.toLowerCase() === (p.service ?? "").toLowerCase());
  const keyOf = (p: ManagedProperty) => p.propertyId ?? p.listingId;

  /* One home can carry several inspections. What matters for the cadence is
     the last one we actually got into, and whether one is in hand now. */
  const lastVisit = new Map<string, string>();
  const inHand = new Set<string>();
  for (const i of existing) {
    for (const k of [i.propertyId, i.listingId, i.osPropertyId]) {
      if (!k) continue;
      if (i.visitedAt && (!lastVisit.has(k) || i.visitedAt > lastVisit.get(k)!)) lastVisit.set(k, i.visitedAt);
      if (OPEN_STATUSES.includes(i.status)) inHand.add(k);
    }
  }

  const horizon = now.getTime() + rules.leadDays * 24 * 60 * 60 * 1000;
  const out: DueVisit[] = [];
  for (const p of properties) {
    const key = keyOf(p);
    if (!key || inHand.has(key) || !inspectable(p)) continue;
    const hmo = Boolean(p.propertyId && hmoIds.has(p.propertyId));
    const next = nextDueFor({ letSince: p.letSince, hmo }, lastVisit.get(key) ?? null, rules);
    if (!next) continue;
    const dueMs = new Date(next.dueAt).getTime();
    if (dueMs > horizon) continue;
    const tenant = p.tenants?.[0] ?? null;
    out.push({
      key,
      kind: next.kind,
      listingId: p.listingId,
      propertyId: p.propertyId,
      propertyName: p.name,
      locality: p.locality,
      landlord: p.landlord?.name ?? "",
      landlordEmail: p.landlord?.email ?? "",
      tenant: tenant?.name ?? "",
      tenantEmail: tenant?.email ?? "",
      tenantPhone: tenant?.phone ?? "",
      tenancyStart: p.letSince,
      dueAt: next.dueAt,
      daysAway: Math.round((dueMs - now.getTime()) / (24 * 60 * 60 * 1000)),
      since: next.since,
      why: next.why,
    });
  }
  /* ONE ROW PER HOME, not per letting.
     A house let by the room is several leased listings in REX against the
     same property, and every one of them produced a due row - the same
     address five times over, with the same key, which React reported as
     duplicate children before anybody noticed the board was lying about how
     much work there was. A visit is of the building: you walk it once. So
     the rows collapse onto the property, keeping the earliest date, which is
     the one that says how late we already are. Rooms inherit the house's
     visit the way they inherit its certificates (lib/houses). */
  const perHome = new Map<string, DueVisit>();
  for (const d of out) {
    const held = perHome.get(d.key);
    if (!held || d.dueAt < held.dueAt) perHome.set(d.key, held ? { ...d, tenant: held.tenant || d.tenant, tenantEmail: held.tenantEmail || d.tenantEmail } : d);
  }
  return [...perHome.values()].sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

/** The four figures at the top of the screen, against the clock right now. */
export function summarise(list: Inspection[], due: DueVisit[], now: Date = new Date()): {
  due: number; overdue: number; awaitingTenant: number; booked: number; toWriteUp: number; openActions: number;
} {
  const t = now.getTime();
  return {
    due: due.length,
    overdue: due.filter((d) => new Date(d.dueAt).getTime() < t).length
      + list.filter((i) => OPEN_STATUSES.includes(i.status) && i.dueAt && new Date(i.dueAt).getTime() < t && !i.visitedAt).length,
    awaitingTenant: list.filter((i) => i.step === "await_access" || i.step === "rearrange").length,
    booked: list.filter((i) => i.status === "booked").length,
    toWriteUp: list.filter((i) => i.step === "report" || i.step === "send_report").length,
    openActions: list.reduce((n, i) => n + (i.openActions ?? 0), 0),
  };
}
