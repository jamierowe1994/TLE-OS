import type { Application } from "@/lib/applications";
import { buildHandoff } from "@/lib/deal-handoff";
import { latestHandover } from "@/lib/handover";
import { getCase } from "@/lib/plc-store";
import { PLC_STATES } from "@/lib/plc";
import { getAllPropolyDeals, type BusinessDeal } from "@/lib/business/propoly-deals";
import { getOverlays, getMeta } from "@/lib/business/deal-store";
import { derivePortalStage } from "@/lib/business/deal-stage";
import { eventsForDeal } from "@/lib/business/deal-watch";
import type { DealEvent } from "@/lib/business/deal-events";
import { loadMoneyContext, moneyForDeal, type MoneyContext } from "@/lib/business/deal-money";
import { stageEvidence } from "@/lib/business/stage-evidence";
import { PORTAL_STAGES, PROPOLY_APP_URL } from "@/lib/business/propoly-stages";

/**
 * One application's journey, start to keys - the agent's view of Kirstie's
 * process.
 *
 * James, 3 Sep: "build a spine that goes from left to right, the same as
 * we've got for the Kirstie section ... the main thing that we need to track
 * is the progress. This needs to be updated on the candidate, landlord, and
 * agent side from the Kirstie side, and then give actions to the agent if
 * required and flag it to them when needed."
 *
 * So the spine is REX's three stops (received, the landlord's decision, the
 * handover) followed by Kirstie's eight (lib/business/propoly-stages), and
 * the eight are read from the SAME place her board reads them: the Propoly
 * deal, her stage override, the money, and stageEvidence. Nothing here is
 * a second opinion on where a deal is.
 *
 * ── Finding the deal ──────────────────────────────────────────────────────
 *
 * Propoly does not know REX's application id. The deal is matched on the
 * property name and, where several deals share an address (rooms in an HMO),
 * the move-in date. A miss is honest: the eight stops sit upcoming with
 * "not in Propoly yet" on the first, which is itself the thing to act on.
 *
 * Deals and money are read once and kept for five minutes across drawers:
 * the Propoly book and PayProp are the slow part, and the agent opening
 * three applications in a row should not pay for them three times.
 */

export interface JourneyStop {
  id: string;
  label: string;
  sub: string | null;
  tone: "ok" | "warn" | "none";
  state: "done" | "current" | "upcoming" | "off";
}

export interface JourneyAction {
  id: string;
  label: string;
  detail: string;
  href: string | null;
  /** Whose move it is. "you" is the agent looking at it. */
  who: "you" | "kirstie" | "landlord" | "tenant";
}

export interface ApplicationJourney {
  stops: JourneyStop[];
  /** What the agent should do, most urgent first. */
  actions: JourneyAction[];
  /** Kirstie's side saying "worth a look", in her words, for reached stages. */
  flags: string[];
  deal: { id: string; stage: string; url: string } | null;
  plc: { id: string; state: string; who: string } | null;
  handover: { mode: "shadow" | "live"; status: string; at: string } | null;
  /** Every move the watcher recorded on the deal, newest first. */
  history: DealEvent[];
}

/* ── the slow parts, kept for five minutes ─────────────────────────────── */

const KEEP_MS = 5 * 60_000;
let dealsCache: { at: number; deals: BusinessDeal[] | null } | null = null;
let moneyCache: { at: number; money: MoneyContext | null } | null = null;

async function deals(): Promise<BusinessDeal[] | null> {
  if (dealsCache && Date.now() - dealsCache.at < KEEP_MS) return dealsCache.deals;
  const d = await getAllPropolyDeals().catch(() => null);
  dealsCache = { at: Date.now(), deals: d };
  return d;
}
async function money(): Promise<MoneyContext | null> {
  if (moneyCache && Date.now() - moneyCache.at < KEEP_MS) return moneyCache.money;
  const m = await loadMoneyContext(new Date()).catch(() => null);
  moneyCache = { at: Date.now(), money: m };
  return m;
}

const norm = (s: string | null | undefined) =>
  (s ?? "")
    .toLowerCase()
    .replace(/\b(apartment|flat|room|unit)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** The street half of an address: "Apartment Flat 9, 29 Springfield Street" → "29 springfield street". */
const street = (address: string) => {
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  const last = parts[parts.length - 1] ?? address;
  return norm(last);
};

function findDeal(app: Application, all: BusinessDeal[]): BusinessDeal | null {
  const want = street(app.property);
  if (!want) return null;
  const hits = all.filter((d) => {
    const have = norm(d.app.propertyName);
    return have.includes(want) || want.includes(have);
  });
  if (hits.length === 0) return null;
  if (hits.length === 1) return hits[0];
  /* Rooms in one house: the move-in date tells them apart. */
  const sameStart = hits.find((d) => app.startDate && d.app.startDate && d.app.startDate.slice(0, 10) === app.startDate.slice(0, 10));
  if (sameStart) return sameStart;
  /* Failing that, the one that is not finished. */
  return hits.find((d) => !["complete", "cancelled", "archived"].includes(d.statusKey)) ?? hits[0];
}

const dayWords = (iso: string | null | undefined) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.valueOf())) return null;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

/* ── the journey ───────────────────────────────────────────────────────── */

export async function journeyFor(app: Application): Promise<ApplicationJourney> {
  const stops: JourneyStop[] = [];
  const actions: JourneyAction[] = [];
  const flags: string[] = [];

  const accepted = app.status === "accepted";
  const unsuccessful = app.status === "unsuccessful";

  /* 1. Received. */
  stops.push({
    id: "received",
    label: "Received",
    sub: app.dateReceived ? `Came in ${dayWords(app.dateReceived)}` : "No date on the record",
    tone: app.dateReceived ? "ok" : "none",
    state: "done",
  });

  /* 2. The landlord's decision. */
  stops.push({
    id: "decision",
    label: "Landlord decision",
    sub: unsuccessful
      ? "Unsuccessful"
      : accepted
        ? `Accepted ${dayWords(app.dateAccepted) ?? ""}`.trim()
        : app.status === "communicated"
          ? "Put to the landlord - waiting on their answer"
          : "Not yet put to the landlord",
    tone: accepted ? "ok" : unsuccessful ? "none" : "none",
    state: unsuccessful ? "off" : accepted ? "done" : "current",
  });

  /* The three sources the rest reads from, in parallel. */
  const [handoff, run, plcCase, allDeals] = await Promise.all([
    buildHandoff(app).catch(() => null),
    latestHandover(app.id).catch(() => null),
    getCase(`plc-${app.id}`).catch(() => null),
    accepted ? deals() : Promise.resolve(null),
  ]);

  const deal = accepted && allDeals ? findDeal(app, allDeals) : null;

  /* 3. The handover: the deal existing in Propoly is the proof it happened,
     whoever did it. Our own run is the record of how. */
  let handoverStop: JourneyStop;
  if (!accepted) {
    handoverStop = { id: "handover", label: "Handover", sub: null, tone: "none", state: unsuccessful ? "off" : "upcoming" };
  } else if (deal) {
    handoverStop = { id: "handover", label: "Handover", sub: "In Propoly", tone: "ok", state: "done" };
  } else if (run?.mode === "live" && run.status === "ok") {
    handoverStop = { id: "handover", label: "Handover", sub: `Handed over ${dayWords(run.finishedAt ?? run.startedAt)}`, tone: "ok", state: "done" };
  } else if (run?.mode === "live") {
    const failed = run.steps.find((s) => s.state === "failed" || s.state === "blocked");
    handoverStop = { id: "handover", label: "Handover", sub: failed ? `Stopped at ${failed.label.toLowerCase()}` : "Did not finish", tone: "warn", state: "current" };
    actions.push({ id: "handover-failed", label: "Finish the handover", detail: failed?.detail ?? "The last run did not complete.", href: null, who: "you" });
  } else {
    handoverStop = {
      id: "handover",
      label: "Handover",
      sub: run ? `Rehearsed ${dayWords(run.startedAt)}; not in Propoly yet` : "Not handed over yet",
      tone: "warn",
      state: "current",
    };
    actions.push({ id: "handover", label: "Hand over to the deal", detail: "Accepted, but nothing is in Propoly for it yet. Rehearse the handover below and check what it is short of.", href: null, who: "you" });
  }
  stops.push(handoverStop);

  /* What the packet says is short - these are the agent's jobs whatever stage it is at. */
  if (handoff) {
    if (!handoff.landlord) {
      actions.push({ id: "landlord", label: "Attach the landlord to the listing in REX", detail: "No owner is on the listing, so there is nobody to create in Propoly or email.", href: null, who: "you" });
    }
    if (app.rightToRentIncomplete) {
      actions.push({ id: "rtr", label: "Record right to rent", detail: "Not recorded for every applicant on the application.", href: null, who: "you" });
    }
    for (const m of handoff.missing) {
      actions.push({ id: `cert:${m.id}`, label: `Get the ${m.label}`, detail: m.why, href: "/compliance", who: "landlord" });
    }
  }

  /* 4 to 11. Kirstie's eight, from where she reads them. */
  let dealInfo: ApplicationJourney["deal"] = null;
  let plcInfo: ApplicationJourney["plc"] = null;
  if (deal) {
    const [overlays, m] = await Promise.all([getOverlays([deal.app.id]).catch(() => new Map()), money()]);
    const meta = overlays.get(deal.app.id)?.meta ?? null;
    /* The same derivation Kirstie's board uses, from the same records, so
       the agent's spine and her board never disagree about where a deal is.
       The PLC case here is the application's own rather than an address
       match, which is the truer of the two. */
    const journeyMoney = m ? moneyForDeal(m, deal.app.propertyName, deal.app.startDate) : null;
    const stageKey = derivePortalStage(
      deal.statusKey,
      {
        plcState: plcCase?.state ?? null,
        plcCaseId: plcCase?.id ?? null,
        plcOutside: meta?.checklist?.plc_outside?.done === true,
        depositDone:
          meta?.checklist?.deposit_registered?.done === true ||
          Boolean(meta?.depositScheme) ||
          Boolean(journeyMoney?.tenancy?.depositId),
        rentIn: Boolean(journeyMoney?.rentReceived),
      },
      meta
    );
    const currentIdx = Math.max(0, PORTAL_STAGES.findIndex((s) => s.key === stageKey));
    const evidenceDeal = m ? { ...moneyForDeal(m, deal.app.propertyName, deal.app.startDate), startDate: deal.app.startDate } : { startDate: deal.app.startDate };
    dealInfo = { id: deal.app.id, stage: stageKey, url: `${PROPOLY_APP_URL}/deals/${deal.app.id}` };

    PORTAL_STAGES.forEach((s, i) => {
      const reached = i <= currentIdx;
      const ev = stageEvidence(s.key, evidenceDeal, { reached, moneyLoaded: Boolean(m?.loaded) });
      let sub: string | null = ev.text || null;
      let tone = ev.tone;
      /* PLC has its own record in the OS, which is truer than any inference. */
      if (s.key === "plc" && plcCase) {
        const st = PLC_STATES.find((x) => x.id === plcCase.state);
        sub = st ? `${st.label} · ${st.who}` : plcCase.state;
        tone = plcCase.state === "approved" ? "ok" : plcCase.state === "declined" ? "warn" : "none";
      }
      if (reached && ev.tone === "warn" && ev.text) flags.push(`${s.label}: ${ev.text}`);
      stops.push({
        id: s.key,
        label: s.label,
        sub,
        tone,
        state: i < currentIdx ? "done" : i === currentIdx ? "current" : "upcoming",
      });
    });
  } else {
    PORTAL_STAGES.forEach((s, i) => {
      stops.push({
        id: s.key,
        label: s.label,
        sub: i === 0 && accepted ? "Not in Propoly yet" : null,
        tone: "none",
        state: unsuccessful ? "off" : "upcoming",
      });
    });
  }

  /* PLC: the agent starts it; Kirstie finishes it. */
  if (plcCase) {
    const st = PLC_STATES.find((x) => x.id === plcCase.state);
    plcInfo = { id: plcCase.id, state: plcCase.state, who: st?.who ?? "" };
    const queries = plcCase.findings.filter((f) => f.level !== "ok");
    if (plcCase.state === "assembling") {
      actions.push({ id: "plc-submit", label: "Finish and submit the PLC pack", detail: "Started but not sent to compliance yet.", href: `/plc/start?application=${encodeURIComponent(app.id)}`, who: "you" });
    } else if (plcCase.state === "deferred" && queries.length) {
      actions.push({ id: "plc-query", label: "Answer Kirstie on the PLC pack", detail: queries.map((f) => f.message).join(" "), href: `/plc/start?application=${encodeURIComponent(app.id)}`, who: "you" });
    } else if (plcCase.state === "declined") {
      actions.push({ id: "plc-declined", label: "The PLC pack was declined", detail: plcCase.decisionNote || "See Kirstie's note on the pack.", href: `/plc/start?application=${encodeURIComponent(app.id)}`, who: "you" });
    } else if (plcCase.state === "submitted" || plcCase.state === "scanning" || plcCase.state === "reviewing") {
      actions.push({ id: "plc-wait", label: "PLC pack is with compliance", detail: `${st?.label ?? plcCase.state} - nothing for you until Kirstie answers.`, href: null, who: "kirstie" });
    } else if (plcCase.state === "approved" && deal?.app.propoly?.depositReplacement) {
      /* PLC passed, and the deal is on Flatfair rather than a cash deposit.
         Kirstie (4 Sep): the agent keys it into Flatfair by hand and she
         cannot generate the agreement until it is done. The tick is the
         deal's "deposit registered" item, read from the same overlay the
         board reads. Until Flatfair's API exists this is the step. */
      const meta = await getMeta(deal.app.id).catch(() => null);
      const tick = meta?.checklist?.deposit_registered;
      if (!tick?.done) {
        actions.push({ id: "flatfair", label: "Set the deal up in Flatfair", detail: "PLC passed. Key it into Flatfair, then tick it done so Kirstie can generate the agreement.", href: `/applications/flatfair?deal=${encodeURIComponent(deal.app.id)}`, who: "you" });
      }
    }
  } else if (accepted) {
    actions.push({ id: "plc-start", label: "Start the PLC check", detail: "The pre-let compliance pack has not been started for this let.", href: `/plc/start?application=${encodeURIComponent(app.id)}`, who: "you" });
  }

  /* The deal's own history, from the watcher. The same rows Kirstie's feed
     shows, scoped to this one deal, so "where's this up to" is answered on
     the application itself rather than by asking her. */
  const history = deal ? await eventsForDeal(deal.app.id).catch(() => []) : [];

  return { stops, actions, flags, deal: dealInfo, plc: plcInfo, handover: run ? { mode: run.mode, status: run.status, at: run.startedAt } : null, history };
}
