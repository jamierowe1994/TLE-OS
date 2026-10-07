/**
 * The back office demo's network: every /api call the real screens make,
 * answered from the invented world (lib/showroom/demo-world) and never from
 * the server.
 *
 * components/showroom/demo/DemoNet installs this in place of fetch for the
 * demo page it is on. A call it recognises is answered the way the real route
 * would answer it - same shape, same rules, the same emails named - with the
 * world changed in memory. A call it does not recognise is REFUSED, never
 * passed through: a demo page opened by somebody who is signed in must not be
 * able to read or write a real record, whatever a screen does next month.
 *
 * The moves are a port of lib/works-orders moveOrder and the emails a port of
 * lib/works-emails emailsForMove. Both are server-only (they talk to the
 * database), so they cannot simply be imported; when either changes, change
 * the matching case here. The rules worth keeping in step are marked.
 */

import type { Move, WorksOrder, WorksEvent } from "@/lib/works-orders";
import type { Finding, Inspection } from "@/lib/inspections";
import { STEPS, stepOf } from "@/lib/works-steps";
import { URGENCIES } from "@/lib/works-catalogue";
import { CAST, CONTRACTORS, DEMO_TOKEN, VISIT_ID, rankedFor, stepped, type DemoWorld } from "@/lib/showroom/demo-world";

export interface DemoReply {
  status: number;
  json: unknown;
  /** Catalogue ids of the emails this call would have sent. */
  sent: string[];
  /** What happened, for the walkthrough to notice: "tell_landlord", "report", "date"... */
  did?: string;
}

const ok = (json: Record<string, unknown>, sent: string[] = [], did?: string): DemoReply => ({ status: 200, json: { ok: true, ...json }, sent, did });
const no = (error: string, status = 400): DemoReply => ({ status, json: { ok: false, error }, sent: [] });

const pounds = (pence: number | null | undefined) =>
  pence == null ? "—" : `£${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: pence % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const when = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "a date to be agreed";

const OPEN = ["reported", "approval", "approved", "scheduled"];
const nowIso = () => new Date().toISOString();

/* ─────────────────────────── the jobs ─────────────────────────── */

function log(w: DemoWorld, orderId: string, by: string, kind: string, text: string) {
  const list = (w.events[orderId] ??= []);
  list.unshift({ id: `ev-${orderId}-${list.length}-${Date.now()}`, orderId, at: nowIso(), by, kind, text } satisfies WorksEvent);
}

/** KEEP IN STEP with moveOrder (lib/works-orders). */
function applyMove(w: DemoWorld, o: WorksOrder, move: Move, by: string): WorksOrder {
  const n: WorksOrder = { ...o, updatedAt: nowIso() };
  let kind: string = move.action;
  let text = "";
  const at = nowIso();
  switch (move.action) {
    case "tell_landlord":
      n.landlordToldAt = at;
      text = `Landlord told - ${move.how === "both" ? "rang and emailed" : move.how === "rang" ? "rang them" : move.how === "text" ? "texted them" : "emailed the report"}.`;
      break;
    case "arranging":
      n.arranging = move.who;
      if (move.who === "landlord") {
        n.landlordFollowUpAt = move.followUpAt ?? new Date(Date.now() + 3 * 86_400_000).toISOString();
        n.status = "approved";
      }
      text = move.who === "landlord" ? `The landlord is organising it with their own people. Follow up ${when(n.landlordFollowUpAt)}.` : "We're arranging it.";
      break;
    case "landlord_resolved":
      Object.assign(n, { landlordResolvedAt: at, status: "done", completedAt: at, completionNote: move.note?.trim() || "Resolved by the landlord's own contractor." });
      text = "Resolved by the landlord.";
      break;
    case "contact_contractor": {
      const c = w.contractors.find((x) => x.id === move.contractorId);
      if (!c) throw new Error("No such contractor.");
      Object.assign(n, { contractorId: c.id, contractorName: c.name, contractorContactedAt: at, contractorConfirmedAt: null });
      kind = "contacted";
      text = `${c.name} contacted about the job.`;
      break;
    }
    case "contractor_confirmed":
      if (!o.contractorId) throw new Error("Pick a contractor first.");
      n.contractorConfirmedAt = at;
      n.contractorToken = DEMO_TOKEN;
      if (o.status === "reported" || o.status === "approved") n.status = o.scheduledAt ? "scheduled" : "approved";
      text = `${o.contractorName} confirmed they'll take it. Works order out; tenant told to expect their call.`;
      break;
    case "tenant_happy":
      Object.assign(n, { tenantHappy: move.happy, tenantHappyAt: at, tenantHappyNote: (move.note ?? "").trim() });
      text = move.happy === "yes" ? "The tenant is happy with the work." : `The tenant is NOT happy: ${move.note?.trim() || "no detail given"}. Back with the agent.`;
      break;
    case "payee":
      n.payee = move.payee;
      text = move.payee === "agent" ? "To be paid to the agent, who paid the contractor themselves." : `To be paid to ${o.contractorName || "the contractor"}.`;
      break;
    case "quote": {
      if (!Number.isFinite(move.quotePence) || move.quotePence < 0) throw new Error("A quote needs a figure.");
      n.quotePence = Math.round(move.quotePence);
      const over = move.quotePence > o.authorityPence;
      if (["reported", "approval", "approved"].includes(o.status)) {
        n.status = over ? "approval" : "approved";
        if (!over) Object.assign(n, { approvedBy: "Within the landlord's authority", approvedAt: at });
      }
      text = `Quote ${pounds(move.quotePence)}${over ? `, over the landlord's authority of ${pounds(o.authorityPence)} - waiting on them` : `, within the landlord's authority of ${pounds(o.authorityPence)}`}.`;
      break;
    }
    case "approve":
      if (!move.approvedBy.trim()) throw new Error("Say who approved it.");
      Object.assign(n, { approvedBy: move.approvedBy.trim(), approvedAt: at });
      if (["reported", "approval"].includes(o.status)) n.status = o.contractorId && o.scheduledAt ? "scheduled" : "approved";
      text = `Approved by ${move.approvedBy.trim()}.`;
      break;
    case "assign": {
      const c = w.contractors.find((x) => x.id === move.contractorId);
      if (!c) throw new Error("No such contractor.");
      Object.assign(n, { contractorId: c.id, contractorName: c.name });
      if (move.scheduledAt) n.scheduledAt = move.scheduledAt;
      if (o.status !== "approval" && OPEN.includes(o.status)) n.status = move.scheduledAt || o.scheduledAt ? "scheduled" : "approved";
      kind = move.scheduledAt ? "scheduled" : "assigned";
      text = move.scheduledAt ? `Booked with ${c.name} for ${when(move.scheduledAt)}.` : `Assigned to ${c.name}.`;
      break;
    }
    case "schedule":
      if (!move.scheduledAt) throw new Error("A booking needs a date.");
      n.scheduledAt = move.scheduledAt;
      if (o.status !== "approval" && OPEN.includes(o.status)) n.status = "scheduled";
      text = `Booked for ${when(move.scheduledAt)}${o.contractorName ? ` with ${o.contractorName}` : ""}.`;
      break;
    case "done":
      if (!move.note.trim()) throw new Error("Say what was done.");
      Object.assign(n, { status: "done", completedAt: move.completedAt ?? at, completionNote: move.note.trim(), tenantToken: DEMO_TOKEN });
      text = `Done. ${move.note.trim()}`;
      break;
    case "invoice":
      if (!Number.isFinite(move.invoicePence) || move.invoicePence < 0) throw new Error("An invoice needs a figure.");
      Object.assign(n, { invoicePence: Math.round(move.invoicePence), invoiceRef: (move.invoiceRef ?? "").trim(), invoicedAt: at, accountsToldAt: at });
      if (["done", "invoiced"].includes(o.status)) n.status = "invoiced";
      text = `Invoice ${pounds(move.invoicePence)}${move.invoiceRef ? ` (${move.invoiceRef.trim()})` : ""}${o.contractorName ? ` from ${o.contractorName}` : ""}.`;
      break;
    case "paid":
      Object.assign(n, { paidAt: at, paidHow: move.paidHow, status: "paid" });
      text = "Paid.";
      break;
    case "cancel":
      if (!move.reason.trim()) throw new Error("Say why.");
      Object.assign(n, { status: "cancelled", cancelledReason: move.reason.trim() });
      text = `Cancelled: ${move.reason.trim()}`;
      break;
    case "reopen":
      Object.assign(n, { status: o.contractorId && o.scheduledAt ? "scheduled" : "reported", cancelledReason: "" });
      text = "Reopened.";
      break;
    case "note":
      if (!move.note.trim()) throw new Error("An empty note.");
      text = move.note.trim();
      break;
    case "edit": {
      const f = move.fields;
      for (const k of Object.keys(f) as (keyof typeof f)[]) if (f[k] !== undefined) (n as unknown as Record<string, unknown>)[k] = f[k];
      if (f.urgency !== undefined && o.kind === "repair") {
        const hours = URGENCIES.find((u) => u.id === f.urgency)?.hours ?? 24 * 14;
        n.dueAt = new Date(new Date(o.reportedAt).getTime() + hours * 3_600_000).toISOString();
      }
      text = "Details updated.";
      break;
    }
    case "file":
      n.files = [...o.files, { ...move.file, at, by }];
      text = `File added: ${move.file.name}.`;
      break;
  }
  if ("note" in move && move.note && move.action !== "note" && move.action !== "done") text += ` ${move.note}`;
  w.orders = w.orders.map((x) => (x.id === n.id ? n : x));
  log(w, n.id, by, kind, text);
  return n;
}

/** KEEP IN STEP with emailsForMove (lib/works-emails): which emails a move sends. */
function emailsFor(o: WorksOrder, action: string, how?: string): string[] {
  const hasContractor = Boolean(o.contractorId);
  switch (action) {
    case "raised": return [...(o.kind === "repair" ? ["works-tenant-received"] : []), ...(hasContractor && o.scheduledAt ? ["works-contractor-order", "works-tenant-booked"] : [])];
    case "tell_landlord": return how === "emailed" || how === "both" ? ["works-landlord-report"] : [];
    case "contact_contractor": return hasContractor ? ["works-contractor-report"] : [];
    case "contractor_confirmed": return ["works-contractor-order", "works-tenant-found"];
    case "assign": return ["works-contractor-order", ...(o.scheduledAt ? ["works-tenant-booked"] : [])];
    case "schedule": return ["works-contractor-booked", "works-tenant-booked", "works-landlord-arranged"];
    case "quote": return o.status === "approval" ? ["works-landlord-approval"] : [];
    case "done": return [o.kind === "repair" ? "works-tenant-happy" : "works-tenant-done", "works-compliance-done"];
    case "invoice": return ["works-accounts-invoice"];
    case "cancel": return hasContractor ? ["works-contractor-cancelled"] : [];
    default: return [];
  }
}

/** The timeline's "who was told" line for each email, as the real route writes it. */
const TOLD: Record<string, string> = {
  "works-tenant-received": `Tenant emailed: "We've got your repair" (${CAST.tenant.email}).`,
  "works-landlord-report": `Landlord emailed the report (${CAST.landlord.email}).`,
  "works-contractor-report": "Contractor emailed the report.",
  "works-contractor-order": "Contractor emailed the works order.",
  "works-tenant-found": `Tenant emailed: "We've found someone" (${CAST.tenant.email}).`,
  "works-tenant-booked": "Tenant emailed the date.",
  "works-contractor-booked": "Contractor emailed the date.",
  "works-landlord-arranged": "Landlord emailed: \"It's arranged\".",
  "works-landlord-approval": "Landlord emailed the quote for approval.",
  "works-tenant-happy": "Tenant emailed: \"Are you happy with the repair?\"",
  "works-tenant-done": "Tenant emailed: the work is done.",
  "works-compliance-done": "Compliance told the job is finished.",
  "works-accounts-invoice": "Accounts told: an invoice to pay.",
  "works-contractor-cancelled": "Contractor told it is cancelled.",
};
const ROLE: Record<string, string> = { tenant: "tenant", landlord: "landlord", contractor: "contractor", compliance: "compliance", accounts: "accounts" };
function outcomes(w: DemoWorld, o: WorksOrder, ids: string[]) {
  for (const id of ids) log(w, o.id, "TLE OS", "email", TOLD[id] ?? "Emailed.");
  return ids.map((id) => ({ to: ROLE[id.split("-")[1]] ?? "tenant", sent: true, address: "sample", via: "Showroom demo, nothing sent" }));
}

function summaryOf(orders: WorksOrder[]) {
  const open = orders.filter((o) => OPEN.includes(o.status));
  const now = Date.now();
  const weekStart = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); })();
  return {
    open: open.length,
    overdue: open.filter((o) => o.dueAt && new Date(o.dueAt).getTime() < now).length,
    emergencies: open.filter((o) => o.urgency === "emergency").length,
    awaitingLandlord: orders.filter((o) => o.status === "approval").length,
    bookedThisWeek: orders.filter((o) => o.status === "scheduled" && o.scheduledAt && new Date(o.scheduledAt).getTime() >= weekStart && new Date(o.scheduledAt).getTime() < weekStart + 7 * 86_400_000).length,
    invoicedUnpaidPence: orders.filter((o) => o.status === "invoiced").reduce((n, o) => n + (o.invoicePence ?? 0), 0),
    byKind: { repair: open.filter((o) => o.kind === "repair").length, planned: open.filter((o) => o.kind === "planned").length },
  };
}

/** createOrder's defaults (lib/works-orders): the urgency sets the clock. */
function raise(w: DemoWorld, b: Partial<WorksOrder>, by: string): WorksOrder {
  const at = nowIso();
  const ref = Math.max(1000, ...w.orders.map((o) => o.ref)) + 1;
  const hours = b.kind === "planned" ? null : URGENCIES.find((u) => u.id === (b.urgency ?? "routine"))?.hours ?? 24 * 14;
  const o: WorksOrder = {
    ...(w.orders[0] ?? ({} as WorksOrder)),
    id: `demo-new-${ref}`, ref, kind: b.kind ?? "repair", status: "reported",
    propertyId: b.propertyId ?? null, propertyName: b.propertyName ?? CAST.property, locality: b.locality ?? CAST.locality,
    landlord: b.landlord ?? CAST.landlord.name, tenant: b.tenant ?? CAST.tenant.name, tenantPhone: b.tenantPhone ?? CAST.tenant.phone, tenantEmail: b.tenantEmail ?? CAST.tenant.email,
    landlordEmail: b.landlordEmail ?? CAST.landlord.email, landlordMobile: b.landlordMobile ?? CAST.landlord.phone,
    landlordToldAt: null, arranging: null, landlordFollowUpAt: null, landlordResolvedAt: null, contractorContactedAt: null, contractorConfirmedAt: null, landlordArrangedAt: null,
    tenantHappy: null, tenantHappyAt: null, tenantHappyNote: "", payee: null, contractorToken: null, tenantToken: null, accountsToldAt: null, complianceToldAt: null,
    title: b.title ?? "A repair", description: b.description ?? "", category: b.category ?? "Other", urgency: b.kind === "planned" ? null : (b.urgency ?? "routine"),
    dueAt: b.kind === "planned" ? (b.dueAt ?? null) : new Date(Date.now() + (hours ?? 336) * 3_600_000).toISOString(),
    reportedBy: b.reportedBy ?? "Agent", reportedAt: at, raisedBy: by,
    contractorId: b.contractorId ?? null, contractorName: b.contractorId ? CONTRACTORS.find((c) => c.id === b.contractorId)?.name ?? "" : "",
    scheduledAt: b.scheduledAt ?? null, access: b.access ?? "", authorityPence: 15000, quotePence: null, approvedBy: "", approvedAt: null,
    completedAt: null, completionNote: "", invoicePence: null, invoiceRef: "", invoicedAt: null, paidAt: null, paidHow: null, cancelledReason: "", files: [],
    createdAt: at, updatedAt: at, rehearsal: false,
  };
  w.orders = [o, ...w.orders];
  w.events[o.id] = [];
  log(w, o.id, by, "raised", `Reported by ${(b.reportedBy ?? "agent").toLowerCase()}.`);
  return o;
}

const TENANT_STATUS: Record<string, string> = { reported: "With us", approval: "Being arranged", approved: "Being arranged", scheduled: "Booked in", done: "Done", invoiced: "Done", paid: "Done", cancelled: "Closed" };

function contractorView(o: WorksOrder) {
  return {
    ref: o.ref, title: o.title, category: o.category, description: o.description, status: o.status, step: stepOf(o),
    address: [o.propertyName, o.locality].filter(Boolean).join(", "), access: o.access, tenant: [o.tenant, o.tenantPhone].filter(Boolean).join(" · "), contractorName: o.contractorName,
    scheduledAt: o.scheduledAt, completedAt: o.completedAt, invoicePence: o.invoicePence, invoiceRef: o.invoiceRef,
    files: o.files.map((f) => ({ name: f.name, at: f.at })),
  };
}

/** The job a token opens: the walkthrough's own, whichever token the page asks with. */
const byToken = (w: DemoWorld) => w.orders.find((o) => o.contractorToken) ?? w.orders.find((o) => o.id.startsWith("demo"));

/* ─────────────────────────── the router ─────────────────────────── */

type Body = unknown;
const val = (b: Body, k: string): string => (b instanceof FormData ? String(b.get(k) ?? "") : String((b as Record<string, unknown> | null)?.[k] ?? ""));

export function answer(w: DemoWorld, method: string, url: URL, body: Body): DemoReply {
  const p = url.pathname;
  const sp = url.searchParams;
  try {
    /* ── Maintenance: the board and the job sheet ── */
    if (p === "/api/works-orders" && method === "GET") {
      const orders = w.orders.filter((o) => (!sp.get("kind") || o.kind === sp.get("kind")) && (sp.get("open") !== "1" || OPEN.includes(o.status)));
      return ok({ live: true, orders, contractors: w.contractors, summary: summaryOf(w.orders), ringForApproval: [], carried: [], carriedDone: [], carriedReadAt: nowIso(), lastMonth: null, lastMonthOn: null, canCorporate: true });
    }
    if (p === "/api/works-orders" && method === "POST") {
      const b = (body ?? {}) as Partial<WorksOrder>;
      if (!b.propertyName?.trim() || !b.title?.trim() || !b.category) return no("A job needs a property, a title and a category.");
      const o = raise(w, b, CAST.agent.name);
      const ids = emailsFor(o, "raised");
      return ok({ order: o, emails: outcomes(w, o, ids) }, ids, "raised");
    }
    if (p === "/api/works-orders/landlord-pref") {
      const pref = { jobEmails: "all", overAmount: 250, updatedBy: "", updatedAt: null, ...(method === "PATCH" ? (body as object) : {}) };
      return ok({ hasEmail: true, pref }, [], method === "PATCH" ? "landlord_pref" : undefined);
    }
    const job = p.match(/^\/api\/works-orders\/([^/]+)$/);
    if (job) {
      const o = w.orders.find((x) => x.id === decodeURIComponent(job[1]));
      if (!o) return no("No such job.", 404);
      if (method === "GET") return ok({ order: o, events: w.events[o.id] ?? [] });
      const move = body as Move;
      if (!move || typeof move.action !== "string") return no("Say what to do.");
      const n = applyMove(w, o, move, CAST.agent.name);
      const ids = emailsFor(n, move.action, "how" in move ? move.how : undefined);
      return ok({ order: n, events: w.events[n.id] ?? [], emails: outcomes(w, n, ids) }, ids, move.action);
    }
    if (p === "/api/contractors") {
      if (method === "POST") {
        const b = (body ?? {}) as Record<string, string>;
        if (!b.name?.trim() || !b.trade?.trim()) return no("A contractor needs a name and a trade.");
        const c = { ...CONTRACTORS[0], ...b, id: `c-new-${w.contractors.length}`, ownerId: null, createdBy: CAST.agent.name, active: true } as (typeof CONTRACTORS)[number];
        w.contractors = [...w.contractors, c];
        return ok({ contractor: c }, [], "contractor_added");
      }
      if (sp.get("for")) {
        const o = w.orders.find((x) => x.id === sp.get("for"));
        if (!o) return no("No such job.", 404);
        return ok({ ranked: rankedFor(o), placed: true });
      }
      if (sp.get("id")) {
        const c = w.contractors.find((x) => x.id === sp.get("id"));
        if (!c) return no("Not in your book.", 404);
        const jobs = w.orders.filter((o) => o.contractorId === c.id);
        return ok({ contractor: c, stats: { jobs: jobs.length, open: jobs.filter((o) => OPEN.includes(o.status)).length, quotedPence: 0, invoicedPence: 0, paidPence: 0, outstandingPence: 0, lastJobAt: jobs[0]?.updatedAt ?? null }, jobs });
      }
      return ok({ contractors: w.contractors, me: "sample", canCorporate: true });
    }
    /* ── Compliance: the book, a home's file, and the desk's To verify ── */
    if (p === "/api/compliance/book" && method === "GET") return ok({ properties: w.homes });
    if (p === "/api/compliance" && method === "GET") {
      const withCert = w.homes.filter((h) => Object.values(h.certs).some((c) => c?.expires != null)).length;
      return ok({
        live: true, properties: w.homes, ageMs: 4 * 60_000, scope: { whole: true, label: "the whole business" },
        counts: { properties: w.homes.length, withAnyRecord: withCert, entries: w.homes.reduce((n, h) => n + Object.keys(h.certs).length, 0), withCertificate: withCert, gasUnknown: 0 },
      });
    }
    if (p === "/api/property-file" && method === "GET") {
      const home = w.homes.find((h) => h.id === (sp.get("property") ?? "")) ?? w.homes[0];
      const LABEL: Record<string, [string, string]> = {
        gas: ["gas_safety", "Gas safety (CP12)"], eicr: ["eicr", "EICR"], epc: ["epc", "EPC"], licence: ["mandatory_hmo_license", "HMO licence"],
        fire: ["emergency_lighting_fire_exit", "Fire safety"], pat: ["portable_appliance_testing", "PAT"], alarms: ["smoke_alarms", "Smoke alarms"],
      };
      const rows = Object.entries(home.certs).flatMap(([k, c]) => {
        const l = LABEL[k];
        if (!l || !c) return [];
        const d = c.expires;
        const expiry = d == null ? null : new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
        return [{ type: l[0], label: l[1], state: d == null ? "missing" : d < 0 ? "expired" : d <= 30 ? "expiring" : "valid", expiry, issued: null, inRex: true, fileInRex: true, files: [] }];
      });
      if (!home.hasGas) rows.push({ type: "gas_safety", label: "Gas safety (CP12)", state: "not-required", expiry: null, issued: null, inRex: true, fileInRex: false, files: [] });
      return ok({ live: true, propertyId: home.id, pendingKey: null, checked: true, match: null, rows, outstanding: rows.filter((r) => r.state !== "valid" && r.state !== "not-required").length });
    }
    if (p === "/api/property-answers") return ok({ properties: [] });
    if (p === "/api/compliance-desk") {
      if (method === "GET") return ok({ stored: true, firstName: "", verify: w.verify, works: [], registerAccuracy: { checked: 48, matched: 46 }, agents: null });
      const b = (body ?? {}) as { action?: string; kind?: string; id?: string; state?: "verified" | "queried"; note?: string; fileAs?: { expiry?: string } | null };
      const item = w.verify.find((v) => v.id === b.id);
      if (b.action === "read") return item?.register ? ok({ read: item.register.read, registerName: item.register.registerName, registerUrl: item.register.registerUrl }) : no("Nothing to read on that one.");
      if (!item) return no("That one has already been checked.");
      if (b.state === "queried") {
        if (!b.note?.trim()) return no("Say what is wrong, so the agent knows what to fix.");
        w.verify = w.verify.map((v) => (v.id === item.id ? { ...v, queried: { note: b.note!.trim(), by: "Compliance", at: nowIso(), told: item.agent } } : v));
        return ok({ said: `Queried. ${item.agent ?? "The agent"} has been emailed what you wrote, and it is in their bell.`, verify: w.verify, works: [] }, [], "queried");
      }
      if (item.kind === "landlord_document" && !b.fileAs?.expiry) return no("Put the date it runs out on it, so it can be filed as a certificate.");
      w.verify = w.verify.filter((v) => v.id !== item.id);
      const who = item.kind === "landlord_document" || /Recreation/.test(item.property) ? "the landlord and the tenant" : "the landlord and the tenants";
      return ok({ said: `${item.what} verified and sent to ${who}${item.door === "Contractor" ? ", with a copy to the engineer" : ""}.`, verify: w.verify, works: [] }, ["certificate-shared-landlord", "certificate-shared-tenant", ...(item.door === "Contractor" ? ["certificate-shared-contractor"] : []), "certificate-shared-compliance"], "verified");
    }
    if (p === "/api/tasks") return method === "GET" ? ok({ tasks: [] }) : ok({}, [], "task");
    /* The page header's bell: quiet in a demo. */
    if (p === "/api/notifications") return ok({ notices: [], unread: 0 });
    if (p === "/api/property/people" && method === "GET") {
      return ok({
        tenants: [{ name: CAST.tenant.name, email: CAST.tenant.email, phone: CAST.tenant.phone }],
        landlord: { name: CAST.landlord.name, email: CAST.landlord.email, phone: CAST.landlord.phone },
        access: "Sophie works from home on Tuesdays and Thursdays. Otherwise a key is in the office.",
        lat: CAST.lat, lng: CAST.lng, source: "the sample",
      });
    }
    if (p === "/api/r2/upload" && method === "POST") {
      const f = body instanceof FormData ? body.get("file") : null;
      const name = f instanceof File ? f.name : "file";
      return ok({ key: `sample/${Date.now()}-${name}`, name, type: f instanceof File ? f.type : "application/octet-stream", url: "#" }, [], "upload");
    }
    if (p === "/api/invoices") return method === "GET" ? ok({ invoices: [], settings: {} }) : no("Invoices are not part of the Showroom demo.");

    /* ── The contractor's page ── */
    if (p.startsWith("/api/contractor/")) {
      const o = byToken(w);
      if (!o || !o.contractorId) return no("That link isn't one of ours.", 404);
      if (method === "GET") return ok({ job: contractorView(o) });
      const by = o.contractorName || "The contractor";
      if (body instanceof FormData) {
        const kind = val(body, "kind") || "photo";
        const f = body.get("file");
        let n = applyMove(w, o, { action: "file", file: { key: `sample/${f instanceof File ? f.name : "file"}`, name: f instanceof File ? f.name : "file", type: f instanceof File ? f.type : "" } }, by);
        const sent: string[] = [];
        if (kind === "certificate") {
          if (!val(body, "type")) return no("Choose what the certificate is.");
          if (!val(body, "expiry")) return no("Put the date it runs out on it.");
          if (!n.completedAt) n = applyMove(w, n, { action: "done", note: "Marked done by the contractor with their certificate." }, by);
          log(w, n.id, "TLE OS", "compliance", `${f instanceof File ? f.name : "The certificate"} filed as a certificate on the property. Waiting for compliance to check it before it goes to the landlord and the tenant.`);
          sent.push(...emailsFor(n, "done"));
          outcomes(w, n, sent);
          return ok({ job: contractorView(n), certificate: { filed: true, share: null } }, sent, "certificate");
        }
        const amount = Number(val(body, "amount").replace(/[£,\s]/g, ""));
        if (kind === "invoice" && amount > 0) {
          if (!n.completedAt) { n = applyMove(w, n, { action: "done", note: val(body, "note") || "Marked done by the contractor with their invoice." }, by); sent.push(...emailsFor(n, "done")); }
          n = applyMove(w, n, { action: "invoice", invoicePence: Math.round(amount * 100), invoiceRef: val(body, "ref") }, by);
          sent.push("works-accounts-invoice");
          outcomes(w, n, sent);
          return ok({ job: contractorView(n) }, sent, "invoice");
        }
        return ok({ job: contractorView(n) }, [], "photo");
      }
      const b = (body ?? {}) as { action?: string; scheduledAt?: string; note?: string };
      if (b.action === "date") {
        if (!b.scheduledAt) return no("When?");
        const n = applyMove(w, o, { action: "schedule", scheduledAt: new Date(b.scheduledAt).toISOString(), note: "Booked by the contractor from their page." }, by);
        const ids = emailsFor(n, "schedule");
        outcomes(w, n, ids);
        return ok({ job: contractorView(n) }, ids, "date");
      }
      if (b.action === "done") {
        const n = applyMove(w, o, { action: "done", note: (b.note ?? "").trim() || "Marked done by the contractor." }, by);
        const ids = emailsFor(n, "done");
        outcomes(w, n, ids);
        return ok({ job: contractorView(n) }, ids, "done");
      }
      return no("Say what to do.");
    }

    /* ── The tenant's "was it sorted?" page ── */
    if (p.startsWith("/api/repair/")) {
      const o = w.orders.find((x) => x.tenantToken) ?? byToken(w);
      if (!o) return no("That link isn't one of ours.", 404);
      if (method === "GET") return ok({ job: { ref: o.ref, title: o.title, address: [o.propertyName, o.locality].filter(Boolean).join(", "), contractorName: o.contractorName, happy: o.tenantHappy, done: Boolean(o.completedAt) } });
      const happy = val(body, "happy");
      if (happy !== "yes" && happy !== "no") return no("Yes or no?");
      const n = applyMove(w, o, { action: "tenant_happy", happy, note: val(body, "note") }, o.tenant);
      return ok({ happy: n.tenantHappy }, [], `happy_${happy}`);
    }

    /* ── The tenant's portal ── */
    if (p === "/api/tenant/maintenance") {
      if (method === "GET") {
        const mine = w.orders.filter((o) => o.tenantEmail === CAST.tenant.email);
        return ok({ jobs: mine.map((o) => ({ id: o.id, ref: o.ref, title: o.title, reportedAt: o.createdAt, status: TENANT_STATUS[o.status] ?? "With us" })) });
      }
      const what = val(body, "what").trim();
      const where = val(body, "where").trim();
      if (what.length < 4) return no("Tell us a little more about what is wrong.");
      /* As the real route: routine, trade "Other", their words as the title,
         and no email - the office grades it on reading. */
      const o = raise(w, { kind: "repair", title: [where, what].filter(Boolean).join(" - ").slice(0, 140), description: what, category: "Other", urgency: "routine", reportedBy: "Tenant" }, CAST.tenant.name);
      return ok({ ref: o.ref }, [], "report");
    }

    /* ── The landlord's portal ── */
    if (p === "/api/landlord/documents" && method === "POST") {
      const kind = val(body, "kind") || "other";
      const f = body instanceof FormData ? body.get("file") : null;
      return ok({ document: { id: `ll-doc-${Date.now()}`, kind, name: f instanceof File ? f.name : "document", at: nowIso() } }, [], "landlord_upload");
    }
    if (p === "/api/landlord/report" && method === "POST") {
      const text = val(body, "text").trim();
      if (text.length < 4) return no("Tell us a little more about what is wrong.");
      const u = val(body, "urgency");
      const o = raise(w, { kind: "repair", title: text.replace(/\s+/g, " ").slice(0, 140), description: text, category: "Other", urgency: u === "Emergency" ? "emergency" : u === "Urgent" ? "urgent" : "routine", reportedBy: "Landlord", landlord: CAST.landlord.name, landlordEmail: CAST.landlord.email }, CAST.landlord.name);
      return ok({ ref: o.ref, emailed: true, to: CAST.agent.email }, [], "landlord_report");
    }

    /* ── Inspections: the board, one visit, and the tenant's link ── */
    if (p === "/api/inspections") {
      if (method === "GET") {
        const list = w.book.inspections;
        const now = Date.now();
        const open = ["due", "arranging", "booked", "visited", "reported", "no_access"];
        return ok({
          live: true, inspections: list, due: w.book.due, actions: [], rules: null,
          me: { id: "sample", name: CAST.agent.name }, team: [{ id: "sample", name: CAST.agent.name }],
          summary: {
            due: w.book.due.length,
            overdue: w.book.due.filter((d) => new Date(d.dueAt).getTime() < now).length + list.filter((i) => open.includes(i.status) && i.dueAt && new Date(i.dueAt).getTime() < now && !i.visitedAt).length,
            awaitingTenant: list.filter((i) => i.step === "await_access" || i.step === "rearrange").length,
            booked: list.filter((i) => i.status === "booked").length,
            toWriteUp: list.filter((i) => i.step === "report" || i.step === "send_report").length,
            openActions: list.reduce((n, i) => n + (i.openActions ?? 0), 0),
          },
          source: "os", readAt: null,
        });
      }
      const b = (body ?? {}) as Partial<Inspection>;
      if (!b.propertyName?.trim()) return no("An inspection needs a property.");
      const exists = w.book.inspections.find((i) => i.propertyName === b.propertyName && !["closed", "cancelled"].includes(i.status));
      if (exists) return ok({ inspection: exists }, [], "inspection_raised");
      const id = b.propertyName === CAST.property ? VISIT_ID : `v-new-${w.book.inspections.length}`;
      const at = nowIso();
      const fresh = stepped({ ...(w.book.inspections[0] ?? ({} as Inspection)), ...emptyVisit, id, ref: 330 + w.book.inspections.length, createdAt: at, updatedAt: at,
        propertyName: b.propertyName, locality: b.locality ?? "", landlord: b.landlord ?? "", landlordEmail: b.landlordEmail ?? "", tenant: b.tenant ?? "", tenantEmail: b.tenantEmail ?? "", tenantPhone: b.tenantPhone ?? "", dueAt: b.dueAt ?? null, kind: (b.kind as Inspection["kind"]) ?? "interim" }, []);
      w.book.inspections = [fresh, ...w.book.inspections];
      w.book.findings[id] = [];
      w.book.events[id] = [{ id: `ie-${id}-0`, inspectionId: id, at, by: CAST.agent.name, kind: "raised", text: "Raised from the due list." }];
      w.book.due = w.book.due.filter((d) => d.propertyName !== b.propertyName);
      return ok({ inspection: fresh }, [], "inspection_raised");
    }
    const visit = p.match(/^\/api\/inspections\/([^/]+)$/);
    if (visit) {
      const id = decodeURIComponent(visit[1]);
      const cur = w.book.inspections.find((i) => i.id === id);
      if (!cur) return no("No such inspection.", 404);
      const held = () => ({ inspection: w.book.inspections.find((i) => i.id === id)!, findings: w.book.findings[id] ?? [], events: w.book.events[id] ?? [] });
      if (method === "GET") return ok(held());
      const b = (body ?? {}) as Record<string, unknown>;
      if (b.finding) {
        const f = b.finding as Partial<Finding> & { room: string };
        const list = w.book.findings[id] ?? [];
        const saved: Finding = { id: f.id ?? `f-new-${list.length}-${Date.now()}`, inspectionId: id, room: f.room, item: f.item ?? "", condition: f.condition ?? "good", note: f.note ?? "", action: f.action ?? "none", responsible: f.responsible ?? null, worksOrderId: f.worksOrderId ?? null, photos: f.photos ?? [], createdAt: nowIso(), createdBy: CAST.agent.name };
        w.book.findings[id] = list.some((x) => x.id === saved.id) ? list.map((x) => (x.id === saved.id ? saved : x)) : [...list, saved];
        visitLog(w, id, "finding", `${[saved.room, saved.item].filter(Boolean).join(" - ")} recorded as ${saved.condition}.`);
        restep(w, id);
        return ok(held(), [], "finding");
      }
      if (b.deleteFinding) {
        w.book.findings[id] = (w.book.findings[id] ?? []).filter((x) => x.id !== b.deleteFinding);
        restep(w, id);
        return ok(held(), [], "finding");
      }
      if (b.raiseWorksOrder) {
        const r = b.raiseWorksOrder as { findingId: string; category: string; urgency: string };
        const f = (w.book.findings[id] ?? []).find((x) => x.id === r.findingId);
        if (!f) return no("No such finding.", 404);
        if (f.worksOrderId) return no("That one already has a works order.");
        const o = raise(w, { kind: "repair", title: [f.room, f.item].filter(Boolean).join(" - "), description: f.note, category: r.category, urgency: r.urgency as WorksOrder["urgency"], reportedBy: "Inspection", tenant: cur.tenant, tenantEmail: cur.tenantEmail, landlord: cur.landlord, landlordEmail: cur.landlordEmail }, CAST.agent.name);
        w.book.findings[id] = (w.book.findings[id] ?? []).map((x) => (x.id === f.id ? { ...x, worksOrderId: o.id } : x));
        visitLog(w, id, "works_order", `${[f.room, f.item].filter(Boolean).join(" - ")} raised as works order ${o.ref}.`);
        restep(w, id);
        return ok({ ...held(), worksOrder: { id: o.id, ref: o.ref } }, [], "raise_works_order");
      }
      const move = b as { action?: string } & Record<string, unknown>;
      if (typeof move.action !== "string") return no("Say what to do.");
      const sent = moveVisit(w, cur, move);
      return ok({ ...held(), emails: sent.map((e) => ({ to: e.includes("landlord") ? "landlord" : "tenant", sent: true, address: "sample" })) }, sent, move.action);
    }
    if (p.startsWith("/api/visit/")) {
      const i = w.book.inspections.find((x) => x.accessToken) ?? w.book.inspections.find((x) => x.id === VISIT_ID);
      if (!i) return no("That link isn't one of ours.", 404);
      if (method === "GET") {
        return ok({ visit: { kind: i.kind === "hmo" ? "HMO visit" : "Property visit", address: [i.propertyName, i.locality].filter(Boolean).join(", "), tenant: i.tenant, offered: i.offered, noticeHours: i.noticeHours, reply: i.accessReply, bookedAt: i.bookedAt, askedAt: i.accessAskedAt, mins: i.visitMins, inspector: (i.inspector || "").split(/\s+/)[0] || "", ackAt: i.tenantAckAt, open: !["closed", "cancelled"].includes(i.status) && !i.visitedAt } });
      }
      const reply = val(body, "reply");
      if (reply === "confirm") {
        if (!i.bookedAt || i.visitedAt) return no("There's no visit booked on this link just now.");
        moveVisit(w, i, { action: "tenant_ack" });
        return ok({ reply: "confirm", at: i.bookedAt }, [], "visit_reply");
      }
      if (reply !== "yes" && reply !== "no" && reply !== "other_time") return no("Tell us yes, another time, or no.");
      const at = reply === "yes" && i.offered.includes(val(body, "at")) ? val(body, "at") : null;
      if (reply === "yes" && !at) return no("Pick one of the times offered.");
      moveVisit(w, i, { action: "access_reply", reply, at, note: val(body, "note") });
      if (at) moveVisit(w, w.book.inspections.find((x) => x.id === i.id)!, { action: "book", at });
      return ok({ reply, at }, [], "visit_reply");
    }

    return no("That is not part of the Showroom demo, so nothing happened.", 404);
  } catch (e) {
    return no(e instanceof Error ? e.message : "That didn't work.");
  }
}

/* ─────────────────────────── visits ─────────────────────────── */

const emptyVisit: Partial<Inspection> = {
  status: "due", offered: [], accessToken: null, accessAskedAt: null, accessReply: null, accessRepliedAt: null, accessNote: "", bookedAt: null,
  tenantConfirmedAt: null, landlordToldAt: null, visitedAt: null, noAccessAt: null, noAccessReason: "", condition: null, summary: "",
  reportedAt: null, reportSentAt: null, closedAt: null, cancelledReason: "", files: [], tenantAckAt: null, tenantAckNote: "",
  checks: { answers: {}, readings: {}, tenantSays: "" }, appointmentId: null,
};

function visitLog(w: DemoWorld, id: string, kind: string, text: string, by: string = CAST.agent.name) {
  const list = (w.book.events[id] ??= []);
  list.unshift({ id: `ie-${id}-${list.length}-${Date.now()}`, inspectionId: id, at: nowIso(), by, kind, text });
}
function restep(w: DemoWorld, id: string) {
  w.book.inspections = w.book.inspections.map((i) => (i.id === id ? stepped(i, w.book.findings[id] ?? []) : i));
}
const stampLondon = (v: string) => new Date(v).toLocaleString("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** KEEP IN STEP with moveInspection (lib/inspections) and emailsForMove (lib/inspection-emails). Returns the emails it would send. */
function moveVisit(w: DemoWorld, cur: Inspection, move: { action?: string } & Record<string, unknown>): string[] {
  const n: Inspection = { ...cur, updatedAt: nowIso() };
  const at = nowIso();
  let line = "";
  const sent: string[] = [];
  const str = (k: string) => String(move[k] ?? "").trim();
  switch (move.action) {
    case "ask_access": {
      const offered = ((move.offered as string[]) ?? []).filter(Boolean).slice(0, 6);
      if (!offered.length) throw new Error("Offer the tenant at least one date.");
      Object.assign(n, { status: "arranging", offered, accessAskedAt: at, accessReply: null, accessRepliedAt: null, accessToken: n.accessToken ?? DEMO_TOKEN, noAccessAt: null });
      line = `Access asked of ${n.tenant || "the tenant"} - ${offered.length} date${offered.length === 1 ? "" : "s"} offered, ${n.noticeHours} hours notice.`;
      sent.push("inspection-tenant-access");
      break;
    }
    case "access_reply":
      Object.assign(n, { status: "arranging", accessReply: move.reply, accessRepliedAt: at, accessNote: str("note"), bookedAt: move.reply === "yes" ? (move.at as string) ?? n.bookedAt : n.bookedAt });
      line = move.reply === "yes" ? `${n.tenant} agreed to the visit.` : move.reply === "other_time" ? `${n.tenant} asked for a different time.` : `${n.tenant} said no to the visit.`;
      break;
    case "book":
      Object.assign(n, { status: "booked", bookedAt: move.at, tenantConfirmedAt: null });
      line = `Booked for ${stampLondon(String(move.at))}.`;
      break;
    case "schedule": {
      if (!move.at || Number.isNaN(new Date(String(move.at)).getTime())) throw new Error("Pick a date and time for the visit.");
      Object.assign(n, { status: "booked", bookedAt: move.at, visitMins: Number(move.mins) || n.visitMins, accessAskedAt: n.accessAskedAt ?? at, accessReply: null, offered: [], tenantConfirmedAt: null, accessToken: n.accessToken ?? DEMO_TOKEN });
      line = `Booked for ${stampLondon(String(move.at))}, ${n.visitMins} minutes, with ${CAST.agent.name}.`;
      if (move.notify) { n.tenantConfirmedAt = at; sent.push("inspection-tenant-booked"); }
      break;
    }
    case "tenant_ack": Object.assign(n, { tenantAckAt: at }); line = `${n.tenant} confirmed the time works for them.`; break;
    case "checks": n.checks = (move.checks as Inspection["checks"]) ?? n.checks; break;
    case "confirm": n.tenantConfirmedAt = at; line = "Marked as confirmed with the tenant."; if (n.bookedAt) sent.push("inspection-tenant-booked"); break;
    case "tell_landlord": n.landlordToldAt = at; line = "The landlord was told the visit is happening."; break;
    case "visited":
      if (move.at && new Date(String(move.at)).getTime() > Date.now() + 5 * 60_000) throw new Error("A visit can't be recorded as done on a day that hasn't happened yet.");
      Object.assign(n, { status: "visited", visitedAt: (move.at as string) || at, noAccessAt: null });
      line = `Visited by ${CAST.agent.name}.`;
      break;
    case "no_access": Object.assign(n, { status: "no_access", noAccessAt: at, noAccessReason: str("reason"), bookedAt: null, tenantConfirmedAt: null }); line = `No access: ${str("reason")}`; break;
    case "report": Object.assign(n, { status: "reported", condition: move.condition, summary: str("summary"), reportedAt: at }); line = `Written up as ${String(move.condition)}.`; break;
    case "report_sent": n.reportSentAt = at; line = `Report marked as sent to ${n.landlord || "the landlord"}.`; if (n.reportedAt) sent.push("inspection-landlord-report"); break;
    case "close": Object.assign(n, { status: "closed", closedAt: at }); line = "Closed."; break;
    case "cancel": Object.assign(n, { status: "cancelled", cancelledReason: str("reason") }); line = `Cancelled: ${str("reason")}`; break;
    case "reopen": Object.assign(n, { status: "arranging", closedAt: null, cancelledReason: "" }); line = "Reopened."; break;
    case "edit": Object.assign(n, (move.patch as object) ?? {}); line = "Details edited."; break;
    case "note": visitLog(w, n.id, "note", str("text")); return [];
    case "file": n.files = [...n.files, { ...(move.file as { key: string; name: string; type: string }), at, by: CAST.agent.name }]; line = "A file was put on the visit."; break;
    default: throw new Error("That isn't something an inspection does.");
  }
  w.book.inspections = w.book.inspections.map((i) => (i.id === n.id ? stepped(n, w.book.findings[n.id] ?? []) : i));
  if (line) visitLog(w, n.id, move.action, line);
  for (const e of sent) visitLog(w, n.id, "email", e === "inspection-landlord-report" ? `Landlord emailed the report (${n.landlordEmail}).` : `Tenant emailed (${n.tenantEmail}).`, "TLE OS");
  return sent;
}

/** The step label a job is on, for a walkthrough caption. */
export const stepLabel = (o: WorksOrder) => STEPS.find((s) => s.id === stepOf(o))?.label ?? "";
