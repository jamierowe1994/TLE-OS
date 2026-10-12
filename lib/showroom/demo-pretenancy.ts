/**
 * THE PRE-TENANCY DEMO - the board and the PLC queue, on the real screens
 * with nothing saved or sent.
 *
 * James, 12 Oct 2026, of the tour's Office: "now do the same for the office
 * walkthrough" - the same click-by-click replica as the valuation. So the
 * Pre-tenancy board (app/(os)/pre-tenancy) and the PLC queue
 * (app/(os)/pre-tenancy/plc) run here the way the valuation does
 * (components/showroom/demo/DemoNet): every /api call they make is answered
 * from this invented book, and anything not answered is refused.
 *
 * ── What it copies, and keeps in step with ──────────────────────────────
 *
 * The stage is a port of derivePortalStage (lib/business/deal-stage), which is
 * server-only. The meta, note and task rules and the words of the activity
 * lines are app/api/deals/[id]/{meta,notes,tasks}. The PLC rules are
 * lib/plc-store and app/api/plc/[id]: check needs a read pack, approve needs a
 * first check, send back and decline need a note.
 *
 * ── Nothing leaves ──────────────────────────────────────────────────────
 *
 * In the product, Sign off emails the agent, Approve can push documents into
 * Propoly and certificates into REX, and an email to the agent goes from the
 * signed-in mailbox. Here each is a variable, and the walkthrough is told
 * which email it would have been.
 *
 * The sample is the Showroom's own: Sophie Turner's let of Raj Chauhan's
 * 8 Recreation Terrace, Sam Whitaker the agent, £1,250 pcm, a £288 holding fee
 * and a £1,442 deposit. Every other deal is invented: example.com emails, Ofcom
 * drama numbers. Dates run from now, so nothing goes stale.
 */

import type { DealMeta, DealNote, DealTask } from "@/lib/business/types";
import { CHECKLIST_ITEMS, DEPOSIT_SCHEMES, PORTAL_STAGES, portalStageOf, recordTicks } from "@/lib/business/propoly-stages";
import { PLC_CHECKS, PLC_STATES, missingDocuments, scanSummary, sortFindings, type Finding, type PlcCase, type PlcDocument } from "@/lib/plc";
import { CAST } from "@/lib/showroom/demo-world";
import type { DemoReply } from "@/lib/showroom/demo-api";

export const SOPHIE_DEAL = "demo-deal-sophie";
export const SOPHIE_PLC = "plc-demo-sophie";
export const LARCH_PLC = "plc-demo-larch";
export const PRETENANCY_MOMENTS = ["board", "plc", "checked", "ready", "moved"] as const;

/** Who is signed in: the pre-tenancy desk, not the agent (the agent is who they write to). */
export const DESK = { id: "u-demo-desk", name: "Jess Carter", email: "jess.sample@example.com" };

const H = 3_600_000;
const D = 24 * H;
const iso = (t: number) => new Date(t).toISOString();
const ymd = (t: number) => new Date(t).toLocaleDateString("en-CA", { timeZone: "Europe/London" });

const ok = (json: Record<string, unknown>, sent: string[] = [], did?: string): DemoReply => ({ status: 200, json: { ok: true, ...json }, sent, did });
const no = (error: string, status = 400): DemoReply => ({ status, json: { ok: false, error }, sent: [] });

type Loose = Record<string, unknown>;

interface DemoDeal {
  id: string;
  /** Propoly's live status (the raw key the stage is derived from). */
  live: string;
  address: string;
  locality: string;
  tenant: string;
  agent: string;
  offer: number;
  moveIn: number;
  received: number;
  image: string | null;
  propoly: Loose;
  extra: Loose;
  depositDone: boolean;
  rentIn: boolean;
  signed: boolean;
}

export interface PretenancyBook {
  deals: DemoDeal[];
  meta: Record<string, DealMeta>;
  notes: Record<string, DealNote[]>;
  tasks: DealTask[];
  cases: PlcCase[];
  seq: number;
}

/* ─────────────────────────── the pack ─────────────────────────── */

const PACK: [PlcDocument["checkId"], string][] = [
  ["landlord-id-aml", "Landlord ID and AML.pdf"],
  ["proof-of-ownership", "Land Registry title.pdf"],
  ["tenant-checks", "Referencing report.pdf"],
  ["gas-safety", "Gas safety certificate CP12.pdf"],
  ["epc", "EPC certificate.pdf"],
  ["eicr", "EICR report.pdf"],
  ["right-to-rent", "Right to Rent share code check.pdf"],
  ["holding-deposit", "Holding deposit receipt.pdf"],
  ["tenancy-agreement", "Tenancy agreement - draft.pdf"],
];

/* Placeholders: a name standing in for a file, so no screen implies a document is on file (lib/plc-demo). */
const docs = (agent: string, at: number): PlcDocument[] =>
  PACK.map(([checkId, name]) => ({ checkId, name, key: `documents/sample/${name}`, url: "#", addedAt: iso(at), addedBy: agent, placeholder: true }));

const longDate = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });

/** What the reader finds: Sophie's pack is clean; Larch Close's gas certificate runs out eleven days into the tenancy. */
function findingsFor(c: PlcCase): Finding[] {
  const moveIn = new Date(`${c.moveInDate}T12:00:00Z`).getTime();
  const fine: Finding[] = [
    { checkId: "eicr", level: "ok", message: "EICR satisfactory, valid for five years.", documentName: "EICR report.pdf", foundDate: ymd(moveIn + 3 * 365 * D) },
    { checkId: "landlord-id-aml", level: "ok", message: "Photographic ID and proof of address present, and the names agree with the title.", documentName: "Landlord ID and AML.pdf" },
    { checkId: "tenancy-agreement", level: "ok", message: "The draft agreement names the tenant and the rent matches the offer.", documentName: "Tenancy agreement - draft.pdf" },
    { checkId: "right-to-rent", level: "ok", message: "Share code checked, with no time limit.", documentName: "Right to Rent share code check.pdf" },
  ];
  if (c.id === LARCH_PLC) {
    const gas = moveIn + 11 * D;
    return [
      { checkId: "gas-safety", level: "blocker", message: `The gas safety certificate expires on ${longDate(gas)}, eleven days after the tenants move in. A new CP12 is needed before the tenancy starts.`, documentName: "Gas safety certificate CP12.pdf", foundDate: ymd(gas) },
      { checkId: "epc", level: "query", message: "The EPC is rated E. That is lettable, but it is one band off the minimum and worth raising with the landlord now.", documentName: "EPC certificate.pdf", foundDate: ymd(moveIn + 5 * 365 * D) },
      ...fine,
    ];
  }
  return [
    { checkId: "gas-safety", level: "ok", message: `Gas safety certificate in date until ${longDate(moveIn + 300 * D)}, well past the move-in.`, documentName: "Gas safety certificate CP12.pdf", foundDate: ymd(moveIn + 300 * D) },
    { checkId: "epc", level: "ok", message: "EPC rated C, valid for another seven years.", documentName: "EPC certificate.pdf", foundDate: ymd(moveIn + 7 * 365 * D) },
    ...fine,
  ];
}

function plcCase(id: string, address: string, agent: string, agentEmail: string, moveIn: number, submitted: number, o: Partial<PlcCase> = {}): PlcCase {
  return {
    id, applicationRef: id.toUpperCase(), address, agentName: agent, agentEmail,
    state: "submitted", submittedAt: iso(submitted), documents: docs(agent, submitted - H), moveInDate: ymd(moveIn),
    agentNote: "", waivers: [], scannedAt: null, findings: [], decidedAt: null, decidedBy: null, decisionNote: "",
    createdAt: iso(submitted - 2 * H), ...o,
  };
}

/* ─────────────────────────── the board ─────────────────────────── */

const AGENTS = { sam: CAST.agent.name, priya: "Priya Shah", tom: "Tom Ellis" };
const agentEmail = (name: string) => name === CAST.agent.name ? CAST.agent.email : `${name.split(" ")[0].toLowerCase()}.sample@example.com`;
const PHOTOS = ["/brand/photo/property.jpg", "/brand/living-room.jpg", "/brand/photo/welcome.jpg", "/brand/photo/welcome-door.webp", "/brand/photo/marketing.jpg"];

const refs = (name: string, decision: string | null) => ({
  tenantRefs: [{ name, required: true, decision }],
  referencing: { status: decision && decision !== "awaiting_result" ? "complete" : "in_progress", outcome: null, startedAt: null, required: 1, decided: decision && decision !== "awaiting_result" ? 1 : 0 },
});
const paid = (at: number) => ({ holdingPaid: { status: "paid", paidAt: iso(at), method: "bank_transfer" } });
const agreement = (status: string) => ({ agreement: { status, tenants: 1, tenantsSigned: status === "signed" ? 1 : 0, landlords: 1, landlordsSigned: status === "signed" ? 1 : 0, guarantorStatus: null, guarantorsRequired: 0, guarantorsDone: 0 } });

function deal(id: string, live: string, address: string, tenant: string, agent: string, moveInDays: number, ageDays: number, o: Partial<DemoDeal> = {}, now = Date.now()): DemoDeal {
  return {
    id, live, address, locality: "Nottingham", tenant, agent, offer: 1250, moveIn: now + moveInDays * D, received: now - ageDays * D,
    image: PHOTOS[id.length % PHOTOS.length], propoly: {}, extra: {}, depositDone: false, rentIn: false, signed: false, ...o,
  };
}

function emptyMeta(dealId: string, now: number): DealMeta {
  return { dealId, stageOverride: null, stageBasedOn: null, stageBy: null, stageAt: null, checklist: {}, depositScheme: null, unarchivedAt: null, updatedAt: iso(now) };
}

const note = (dealId: string, who: string, role: DealNote["authorRole"], text: string, at: number, kind: DealNote["kind"] = "note"): DealNote =>
  ({ id: `n-${dealId}-${at}`, dealId, authorId: who === DESK.name ? DESK.id : `u-${who.split(" ")[0].toLowerCase()}`, authorName: who, authorRole: role, kind, text, createdAt: iso(at) });

/** Everything on the board and in the queue at moment `at`. */
export function pretenancyBook(at: number, now = Date.now()): PretenancyBook {
  /* Hours ago, kept to office hours: a pack handed over at 3am reads wrong. */
  const office = (t: number) => {
    const d = new Date(t);
    if (d.getHours() < 8) d.setHours(8, 40, 0, 0);
    else if (d.getHours() >= 18) d.setHours(17, 20, 0, 0);
    return Math.min(d.getTime(), now - 10 * 60_000);
  };
  const ago = (h: number) => office(now - h * H);
  const sophieIn = now + 16 * D;
  const sophie: DemoDeal = deal(SOPHIE_DEAL, "references", CAST.property, CAST.tenant.name, AGENTS.sam, 16, 6, {
    locality: CAST.locality, image: "/brand/photo/property.jpg",
    propoly: { ...paid(now - 5 * D), ...refs(CAST.tenant.name, "awaiting_result"), holdingFee: 288, deposit: 1442, service: "full_managed", depositReplacement: false, landlord: { name: CAST.landlord.name, email: CAST.landlord.email, phone: CAST.landlord.phone } },
  }, now);
  if (at >= 1) { sophie.live = "tenancy_generation"; sophie.propoly = { ...sophie.propoly, ...refs(CAST.tenant.name, "acceptable") }; }
  if (at >= 3) {
    sophie.live = "signing_and_move_in_monies";
    sophie.propoly = { ...sophie.propoly, ...agreement("signed"), executedAt: iso(now - 1 * D), moveInMonies: { status: "paid", paidAt: iso(now - 20 * H) } };
    sophie.depositDone = true; sophie.signed = true; sophie.rentIn = true;
    sophie.extra = {
      money: { holding: { status: "received", amount: 288, on: ymd(now - 5 * D), matchedBy: "name", tenantName: CAST.tenant.name, note: "" }, deposit: { status: "received", amount: 1442, on: ymd(now - 20 * H), matchedBy: "name", tenantName: CAST.tenant.name, depositId: "DEP-1042", note: "" } },
      rentReceived: { amount: 1250, on: ymd(now - 20 * H), paidOut: false },
      rentSchedule: { from: ymd(sophieIn), rent: 1250 },
      schemeSuggestion: null,
    };
  }

  const deals: DemoDeal[] = [
    deal("demo-deal-hawthorn", "start_deal", "14 Hawthorn Street", "Megan Price", AGENTS.priya, 34, 1, { offer: 950 }, now),
    deal("demo-deal-castle", "holding_fee", "Flat 2, 9 Castle Boulevard", "Leo Grant", AGENTS.tom, 27, 3, { offer: 875, extra: { holdingInvoice: { amount: 201, fromDate: ymd(now - 2 * D) } } }, now),
    deal("demo-deal-lime", "holding_fee", "31 Lime Grove", "Hannah Doyle", AGENTS.sam, 24, 4, { offer: 1100, propoly: paid(now - 1 * D) }, now),
    deal("demo-deal-carrington", "references", "5 Carrington Street", "Aisha Khan", AGENTS.priya, 20, 9, { offer: 1050, propoly: { ...paid(now - 6 * D), ...refs("Aisha Khan", "awaiting_result") } }, now),
    sophie,
    deal("demo-deal-larch", "tenancy_generation", "27 Larch Close", "Owen Hughes", AGENTS.tom, 12, 14, { offer: 1175, propoly: { ...paid(now - 11 * D), ...refs("Owen Hughes", "acceptable") } }, now),
    deal("demo-deal-mill", "tenancy_generation", "Flat 3, 41 Mill Road", "Grace Lin", AGENTS.priya, 9, 15, { offer: 825, propoly: { ...paid(now - 12 * D), ...refs("Grace Lin", "acceptable") } }, now),
    deal("demo-deal-beech", "tenancy_generation", "62 Beech Avenue", "Callum Ward", AGENTS.sam, 8, 17, { offer: 1300, propoly: { ...paid(now - 14 * D), ...refs("Callum Ward", "acceptable") } }, now),
    deal("demo-deal-elm", "signing_and_move_in_monies", "18 Elm Bank", "Zara Ahmed", AGENTS.tom, 6, 19, { offer: 990, depositDone: true, propoly: { ...paid(now - 16 * D), ...refs("Zara Ahmed", "acceptable"), ...agreement("awaiting_signatures") } }, now),
    deal("demo-deal-willow", "signing_and_move_in_monies", "3 Willow Court", "Ethan Cole", AGENTS.priya, 3, 22, { offer: 1150, depositDone: true, signed: true, rentIn: true, propoly: { ...paid(now - 19 * D), ...refs("Ethan Cole", "acceptable"), ...agreement("signed") }, extra: { rentReceived: { amount: 1150, on: ymd(now - 2 * D), paidOut: false } } }, now),
    deal("demo-deal-church", "complete", "11 Church Lane", "Ruby Shaw", AGENTS.sam, 0, 26, { offer: 1025, depositDone: true, signed: true, rentIn: true, propoly: { ...paid(now - 23 * D), ...refs("Ruby Shaw", "acceptable"), ...agreement("signed") } }, now),
  ];

  const meta: Record<string, DealMeta> = {};
  for (const d of deals) meta[d.id] = emptyMeta(d.id, now);
  if (at >= 3) {
    meta[SOPHIE_DEAL].depositScheme = "TDS Custodial";
    for (const k of ["right_to_rent", "deposit_registered", "standing_order"]) meta[SOPHIE_DEAL].checklist[k] = { done: true, by: DESK.name, at: iso(now - 20 * H) };
  }
  if (at >= 4) Object.assign(meta[SOPHIE_DEAL], { stageOverride: "move_day", stageBasedOn: sophie.live, stageBy: DESK.name, stageAt: iso(now - H) });
  meta["demo-deal-beech"].depositScheme = null;

  const notes: Record<string, DealNote[]> = {
    [SOPHIE_DEAL]: [
      note(SOPHIE_DEAL, AGENTS.sam, "agent", "Sophie's holding fee is in and her references have gone off. She'd love to move in on the date we said if we can.", office(now - 5 * D)),
      note(SOPHIE_DEAL, DESK.name, "pretenancy", "Thanks Sam, on it. I'll chase the references on Thursday if they're not back.", office(now - 5 * D) + 2 * H),
    ],
    "demo-deal-carrington": [note("demo-deal-carrington", AGENTS.priya, "agent", "Any news on Aisha's references?", ago(20))],
  };
  if (at >= 1) notes[SOPHIE_DEAL].push(note(SOPHIE_DEAL, AGENTS.sam, "agent", "References are back and all passed. The PLC pack is with you now.", ago(6)));
  if (at >= 3) notes[SOPHIE_DEAL].push(note(SOPHIE_DEAL, DESK.name, "pretenancy", "recorded the deposit as held with TDS Custodial", ago(20), "system"));

  const cases: PlcCase[] = [
    plcCase(LARCH_PLC, "27 Larch Close, Nottingham NG7 2RD", AGENTS.tom, agentEmail(AGENTS.tom), now + 12 * D, ago(70), { agentNote: "Landlord is abroad until the 20th, so anything needing a signature will take a couple of days." }),
    plcCase("plc-demo-mill", "Flat 3, 41 Mill Road, Nottingham NG7 1FL", AGENTS.priya, agentEmail(AGENTS.priya), now + 9 * D, ago(30), { state: "checked", scannedAt: iso(ago(29)), checkedAt: iso(ago(20)), checkedBy: "Ben Morris", checkedByEmail: "ben.sample@example.com", checkNote: "Every document read against the pack. All in order." }),
    plcCase("plc-demo-beech", "62 Beech Avenue, Nottingham NG7 6LB", AGENTS.sam, CAST.agent.email, now + 8 * D, ago(80), { state: "approved", scannedAt: iso(ago(79)), checkedAt: iso(ago(60)), checkedBy: "Ben Morris", decidedAt: iso(ago(50)), decidedBy: DESK.name }),
  ];
  /* From the second moment Larch Close has been read, so the walkthrough can open on its findings. */
  if (at >= 1) Object.assign(cases[0], { state: "reviewing", scannedAt: iso(ago(3)) });
  for (const c of cases) if (c.scannedAt) c.findings = findingsFor(c);
  if (at >= 1) {
    const s = plcCase(SOPHIE_PLC, `${CAST.property}, Nottingham ${CAST.postcode}`, AGENTS.sam, CAST.agent.email, sophieIn, ago(5), { agentNote: "Sophie is keen to move in on the day. The landlord, Raj, is happy for the keys to be released once everything is through." });
    if (at >= 2) Object.assign(s, { state: "checked", scannedAt: iso(ago(4.5)), checkedAt: iso(ago(2)), checkedBy: "Ben Morris", checkedByEmail: "ben.sample@example.com", checkNote: "Every document read against the pack. All in order." });
    if (at >= 3) Object.assign(s, { state: "approved", decidedAt: iso(ago(26)), decidedBy: DESK.name, decisionNote: "" });
    if (s.scannedAt) s.findings = findingsFor(s);
    cases.push(s);
  }

  return { deals, meta, notes, tasks: [], cases, seq: 1 };
}

/* ─────────────────────────── the stage ─────────────────────────── */

const keyOf = (s: string) => {
  const w = s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  const n = w.find((x) => /^\d+$/.test(x));
  const st = w.find((x) => /^[a-z]{3,}$/.test(x) && !["flat", "room", "the"].includes(x));
  return n && st ? `${n}|${st}` : "";
};
const caseFor = (book: PretenancyBook, d: DemoDeal) => book.cases.filter((c) => keyOf(c.address) === keyOf(d.address)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;

/** A port of derivePortalStage (lib/business/deal-stage, server-only). */
function stageOf(book: PretenancyBook, d: DemoDeal, now: number): string {
  const m = book.meta[d.id];
  if (d.live === "cancelled") return "cancelled";
  if (m?.stageOverride === "move_day" && m.stageBasedOn === d.live) return "move_day";
  const plc = caseFor(book, d);
  const depositDone = d.depositDone || m?.checklist?.deposit_registered?.done === true || Boolean(m?.depositScheme);
  switch (d.live) {
    case "start_deal": return "deal_started";
    case "holding_fee": return "holding_fee";
    case "references": return "referencing";
    case "tenancy_generation":
      if (d.moveIn < now - D) return "move_day";
      if (d.rentIn || d.signed) return "rent_payment";
      if (plc?.state !== "approved" && !m?.checklist?.plc_outside?.done) return "plc";
      if (!depositDone) return "deposit";
      return "tenancy_agreement";
    case "signing_and_move_in_monies": return d.rentIn || d.signed ? "rent_payment" : "tenancy_agreement";
    case "complete": return "move_day";
    default: return portalStageOf(d.live);
  }
}

function boardDeal(book: PretenancyBook, d: DemoDeal, now: number): Loose {
  const m = book.meta[d.id];
  const eff = stageOf(book, d, now);
  const plc = caseFor(book, d);
  const st = plc ? PLC_STATES.find((s) => s.id === plc.state) : null;
  const ns = book.notes[d.id] ?? [];
  const human = ns.filter((n) => (n.kind ?? "note") === "note");
  const last = human[human.length - 1];
  const app = {
    id: d.id, listingId: null, propertyName: d.address, locality: d.locality, image: d.image, offer: d.offer,
    startDate: ymd(d.moveIn), dateReceived: iso(d.received), hasPets: false, notes: null, conditions: null,
    tenants: [{ name: d.tenant, email: `${d.tenant.split(" ")[0].toLowerCase()}.sample@example.com`, phone: "07700 900" + String(100 + (d.id.length * 37) % 900), isPrimary: true }],
    propoly: { statusKey: d.live, ...d.propoly },
  };
  const auto = recordTicks(app as never, null);
  const done = CHECKLIST_ITEMS.filter((i) => m?.checklist[i.key]?.done || auto[i.key]).length;
  return {
    app, statusKey: d.live, effectiveStatusKey: eff,
    plc: plc && st ? { id: plc.id, state: plc.state, label: st.label, who: st.who, decidedBy: plc.decidedBy, decidedAt: plc.decidedAt } : null,
    agentName: d.agent, agentEmail: agentEmail(d.agent), serviceLevel: "Fully managed",
    portal: {
      notesCount: human.length,
      lastNote: last ? { text: last.text, authorName: last.authorName, authorRole: last.authorRole, at: last.createdAt } : null,
      override: m?.stageOverride && eff !== portalStageOf(d.live) ? { stageKey: m.stageOverride, by: m.stageBy ?? "", at: m.stageAt ?? "" } : null,
      checklistDone: done, checklistTotal: CHECKLIST_ITEMS.length,
    },
    compliance: { outstanding: 0, expired: 0, problems: [], checked: true },
    flags: [], archived: false,
    ...d.extra,
  };
}

function board(book: PretenancyBook, now: number) {
  const deals = book.deals.map((d) => boardDeal(book, d, now));
  const active = deals.filter((d) => d.statusKey !== "cancelled" && d.statusKey !== "complete");
  const today = ymd(now);
  return {
    configured: true, deals, savedAt: iso(now - 2 * 60_000), duplicates: [], compliancePending: false,
    summary: {
      moneyCoverage: { loaded: true, months: [], withRent: 2, withSchedule: 2, inArrears: 0, arrearsLoaded: true, total: deals.length },
      pipelineTotal: active.length,
      byStage: PORTAL_STAGES.map((s) => ({ key: s.key, label: s.label, count: active.filter((d) => d.effectiveStatusKey === s.key).length })),
      overdue: active.filter((d) => String((d.app as Loose).startDate) < today).length,
      undated: 0, completedMtd: 4, forecastByMonth: null,
    },
  };
}

/* ─────────────────────────── the PLC ─────────────────────────── */

function loaded(c: PlcCase) {
  return {
    case: { ...c, findings: sortFindings(c.findings) }, checks: PLC_CHECKS, missing: missingDocuments(c).map((m) => m.id),
    summary: c.scannedAt ? scanSummary(c.findings) : null, scanConfigured: true,
    me: { canCheck: true, canApprove: true, approveBlocked: null }, rlp: null,
  };
}

function plcAction(book: PretenancyBook, c: PlcCase, b: Loose, now: number): DemoReply {
  const action = String(b.action ?? "");
  const note = String(b.note ?? "").trim();
  if (action === "scan" || action === "skip-scan") {
    if (c.state !== "submitted" && c.state !== "scanning") return no("This pack has already been read.", 409);
    Object.assign(c, { state: "reviewing" }, action === "scan" ? { scannedAt: iso(now), findings: findingsFor(c) } : {});
    return ok({ case: c }, [], action === "scan" ? "plc_scanned" : "plc_skipped");
  }
  if (action === "check") {
    if (c.state === "checked") return no("This has already had its first check, and is waiting for the final approval.", 409);
    if (c.state === "submitted" || c.state === "scanning") return no("Read the pack first: run the scan, or skip it.", 409);
    if (c.state !== "reviewing") return no("This has already been decided.", 409);
    Object.assign(c, { state: "checked", checkedAt: iso(now), checkedBy: DESK.name, checkedByEmail: DESK.email, checkNote: note });
    return ok({ case: c }, [], "plc_checked");
  }
  if (action === "decide") {
    const decision = String(b.decision ?? "");
    if (!["approved", "deferred", "declined"].includes(decision)) return no("Approve, send back or decline.");
    if (["approved", "deferred", "declined"].includes(c.state)) return no("This has already been decided.", 409);
    if (decision === "deferred" && !note) return no("Say what's missing. The agent only sees this note.", 409);
    if (decision === "declined" && !note) return no("A decline needs a reason on the record.", 409);
    if (decision === "approved" && c.state !== "checked") return no("This needs its first check before it can be approved.", 409);
    Object.assign(c, { state: decision, decidedAt: iso(now), decidedBy: DESK.name, decisionNote: note });
    return ok({ case: c }, [], `plc_${decision}`);
  }
  if (action === "push-propoly" || action === "push-rex") return no("The demo never writes to another system. In the OS this files the pack's documents there.", 409);
  if (action === "rlp-send") return no("The demo sends nothing.", 409);
  return no("That is not part of the demo.", 404);
}

/* ─────────────────────────── the router ─────────────────────────── */

/** A pre-tenancy or PLC call, answered; null when the path is not one of these. */
export function answerPretenancy(book: PretenancyBook, method: string, url: URL, body: unknown): DemoReply | null {
  const p = url.pathname, sp = url.searchParams;
  const b = (body && typeof body === "object" && !(body instanceof FormData) ? body : {}) as Loose;
  const now = Date.now();
  const byId = (id: string) => book.deals.find((d) => d.id === id) ?? null;

  if (p === "/api/auth/me") return ok({ user: { id: DESK.id, name: DESK.name, email: DESK.email, role: "pretenancy", photo: null }, role: "pretenancy" });
  if (p === "/api/prefs") return ok({ prefs: {}, signedIn: false });

  /* ── the board ── */
  if (p === "/api/pretenancy/deals" && method === "GET") return ok(board(book, now));
  if (p === "/api/pretenancy/refresh") return ok({ refreshed: true }, [], "refreshed");

  /* ── Tasks today, and a tick on any task ── */
  if (p === "/api/my/deal-tasks" && method === "GET") {
    const due = sp.get("due");
    return ok({ tasks: book.tasks.filter((t) => !due || (t.dueDate !== null && t.dueDate <= due)) });
  }
  if (p === "/api/my/deal-tasks" && method === "PATCH") {
    const t = book.tasks.find((x) => x.id === String(b.id));
    if (!t) return no("No such task.", 404);
    t.done = b.done === true;
    t.completedAt = t.done ? iso(now) : null;
    return ok({ task: t }, [], t.done ? "task_done" : "task_undone");
  }

  /* ── one deal ── */
  const m = p.match(/^\/api\/deals\/([^/]+)\/([a-z-]+)$/);
  if (m) {
    const d = byId(decodeURIComponent(m[1]));
    if (!d) return no("No such deal.", 404);
    const what = m[2];
    const meta = (book.meta[d.id] ??= emptyMeta(d.id, now));
    const log = (text: string) => (book.notes[d.id] ??= []).push(note(d.id, DESK.name, "pretenancy", text, now + book.seq++, "system"));
    const notes = () => book.notes[d.id] ?? [];

    if (what === "notes" && method === "GET") {
      return ok({ notes: notes().filter((n) => n.kind !== "private"), privateNotes: notes().filter((n) => n.kind === "private"), meta, effectiveStatusKey: stageOf(book, d, now) });
    }
    if (what === "notes" && method === "POST") {
      const text = String(b.text ?? "").trim();
      if (!text) return no("Write something first.");
      const n = note(d.id, DESK.name, "pretenancy", text, now + book.seq++, b.kind === "private" ? "private" : "note");
      (book.notes[d.id] ??= []).push(n);
      return ok({ note: n }, [], n.kind === "private" ? "private_note" : "note");
    }
    if (what === "meta" && method === "POST") {
      const reply = (did: string, sent: string[] = []) => { meta.updatedAt = iso(now); return ok({ meta, statusKey: d.live, effectiveStatusKey: stageOf(book, d, now) }, sent, did); };
      if ("stage" in b) {
        if (b.stage === null) {
          Object.assign(meta, { stageOverride: null, stageBasedOn: null, stageBy: null, stageAt: null });
          log("reset the stage to Propoly's live status");
          return reply("stage_reset");
        }
        if (b.stage !== "move_day") return no("Stages move on their own now. Only Move day is moved by hand.");
        Object.assign(meta, { stageOverride: "move_day", stageBasedOn: d.live, stageBy: DESK.name, stageAt: iso(now) });
        log("moved the deal to Move day");
        return reply("move_day", ["deal-moved"]);
      }
      if (typeof b.unarchived === "boolean") {
        meta.unarchivedAt = b.unarchived ? iso(now) : null;
        log(b.unarchived ? "took the deal out of the archive" : "returned the deal to the archive");
        return reply("unarchived");
      }
      if ("depositScheme" in b) {
        const s = b.depositScheme;
        if (s !== null && (typeof s !== "string" || !DEPOSIT_SCHEMES.includes(s))) return no("Unknown deposit scheme.");
        meta.depositScheme = (s as string | null) ?? null;
        log(s === null ? "cleared the deposit scheme" : `recorded the deposit as held with ${s}`);
        return reply("deposit_scheme");
      }
      if (b.checklist && typeof b.checklist === "object") {
        const { key, done } = b.checklist as { key?: unknown; done?: unknown };
        const item = CHECKLIST_ITEMS.find((i) => i.key === key);
        if (!item) return no("Unknown checklist item.");
        if (done === true) meta.checklist[item.key] = { done: true, by: DESK.name, at: iso(now) };
        else delete meta.checklist[item.key];
        log(`${done === true ? "ticked" : "unticked"} "${item.label}" on the checklist`);
        return reply(done === true ? "ticked" : "unticked");
      }
      return no("Nothing to do.");
    }
    if (what === "tasks" && method === "GET") return ok({ tasks: book.tasks.filter((t) => t.dealId === d.id) });
    if (what === "tasks" && method === "POST") {
      const title = String(b.title ?? "").trim();
      if (!title) return no("Say what the follow-up is.");
      const due = typeof b.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.dueDate) ? b.dueDate : null;
      const t: DealTask = { id: `t-demo-${book.seq++}`, dealId: d.id, dealLabel: d.address, userId: DESK.id, title, dueDate: due, done: false, createdAt: iso(now), completedAt: null };
      book.tasks.push(t);
      const fmt = due ? new Date(`${due}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }) : "";
      log(`set a follow-up: "${title}"${due ? ` · due ${fmt}` : ""}`);
      return ok({ task: t }, [], "task");
    }
    if (what === "tenant-documents") return ok({ documents: [] });
    if (what === "emails" && method === "GET") return ok({ connected: false, emails: [], agentName: d.agent, agentEmail: agentEmail(d.agent) });
    if (what === "email-send") return no("Connect your email first. The demo has no mailbox, so nothing is sent.", 409);
  }

  /* ── the Documents tab: what is filed for the address ── */
  if (p === "/api/documents" && method === "GET") return ok({ docs: [] });
  if (p === "/api/documents") return no("The demo keeps no files. In the OS this files it against the property.", 409);

  /* ── the mailbox: never connected here, and no password is ever taken ── */
  if (p === "/api/me/mailbox" && method === "GET") return ok({ connected: false });
  if (p === "/api/me/mailbox") return no("The demo never connects a mailbox.", 409);

  /* ── the PLC queue and one pack ── */
  if (p === "/api/plc" && method === "GET") {
    const queue = book.cases.filter((c) => ["submitted", "scanning", "reviewing", "checked"].includes(c.state)).sort((a, b) => String(a.submittedAt).localeCompare(String(b.submittedAt)));
    return ok({ cases: sp.get("queue") === "1" ? queue : book.cases, checks: PLC_CHECKS, scanConfigured: true });
  }
  const pc = p.match(/^\/api\/plc\/([^/]+)$/);
  if (pc) {
    const c = book.cases.find((x) => x.id === decodeURIComponent(pc[1]));
    if (!c) return no("No such pack.", 404);
    if (method === "GET") return ok(loaded(c));
    if (method === "POST") return plcAction(book, c, b, now);
  }

  return null;
}
