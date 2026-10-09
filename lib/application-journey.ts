import { sameHome } from "@/lib/address-parse";
import type { Application } from "@/lib/applications";
import { decisionsFor } from "@/lib/offer-decisions";
import { buildHandoff } from "@/lib/deal-handoff";
import { handoverMode, latestHandover } from "@/lib/handover";
import { getCase } from "@/lib/plc-store";
import { PLC_STATES } from "@/lib/plc";
import { dealStatusLabel, getAllPropolyDeals, type BusinessDeal } from "@/lib/business/propoly-deals";
import { getOverlays, getMeta } from "@/lib/business/deal-store";
import { derivePortalStage } from "@/lib/business/deal-stage";
import { eventsForDeal } from "@/lib/business/deal-watch";
import type { DealEvent } from "@/lib/business/deal-events";
import { loadMoneyContext, moneyForDeal, type MoneyContext } from "@/lib/business/deal-money";
import { stageEvidence } from "@/lib/business/stage-evidence";
import { withoutDuplicates } from "@/lib/business/deal-dupes";
import { flatbondForDeal, loadFlatbonds } from "@/lib/business/flatfair-deal";
import { PORTAL_STAGES, propolyDealUrl } from "@/lib/business/propoly-stages";
import { switchOn } from "@/lib/switches";
import { closedReasons, getApplications } from "@/lib/applications";
import { feeOf, otherOpenOffers } from "@/lib/offer-hold";

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
  /** A test application's own step, played by a button (lib/test-overlay). */
  test?: "accept" | "decline" | "advance";
  /** The agent's Accept or Decline on a real offer, kept in the OS
   *  (lib/offer-decisions, 7 Oct 2026); "undo" opens it again. */
  decide?: "accepted" | "declined" | "undo";
  /** Push to Propoly (9 Oct 2026): the drawer runs the handover from here. */
  push?: boolean;
  /** Let the other applicants know: how many offers are held on the home. */
  release?: number;
  /** A reminder, never the Next Step while anything else is open. */
  minor?: boolean;
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
  const all = await getAllPropolyDeals().catch(() => null);
  /* A deal started twice for one tenant is matched to the newer one only
     (lib/business/deal-dupes): the spine must not read the abandoned copy. */
  const d = all ? withoutDuplicates(all).deals : null;
  /* A read that failed is not kept. It was, for five minutes, and for those
     five minutes every accepted application said "it isn't in Propoly yet". */
  if (d) dealsCache = { at: Date.now(), deals: d };
  return d;
}
async function money(): Promise<MoneyContext | null> {
  if (moneyCache && Date.now() - moneyCache.at < KEEP_MS) return moneyCache.money;
  const m = await loadMoneyContext(new Date()).catch(() => null);
  moneyCache = { at: Date.now(), money: m };
  return m;
}

function findDeal(app: Application, all: BusinessDeal[]): BusinessDeal | null {
  if (!app.property?.trim()) return null;
  const hits = all.filter((d) => sameHome(app.property, d.app.propertyName ?? ""));
  if (hits.length === 0) return null;
  if (hits.length === 1) return hits[0];
  /* Rooms in one house: the move-in date tells them apart. */
  const sameStart = hits.find((d) => app.startDate && d.app.startDate && d.app.startDate.slice(0, 10) === app.startDate.slice(0, 10));
  if (sameStart) return sameStart;
  /* Failing that, the one that is not finished. */
  return hits.find((d) => !["complete", "cancelled", "archived"].includes(d.statusKey)) ?? hits[0];
}

/**
 * The Propoly deal for an application, from the same five-minute copy the
 * journey reads. For the holding fee on a listing's other offers (lib/offer-
 * hold). Null when the deal isn't in Propoly or Propoly couldn't be read.
 */
export async function dealForApplication(app: Application): Promise<BusinessDeal | null> {
  const all = await deals();
  return all ? findDeal(app, all) : null;
}

/** Whether Propoly's deals could be read just now. A null deal means nothing when they couldn't. */
export async function dealsReadable(): Promise<boolean> {
  return (await deals().catch(() => null)) !== null;
}

/** A deal at this address, by the address alone - for an offer with no REX application. */
export async function dealAtAddress(address: string): Promise<BusinessDeal | null> {
  const all = await deals();
  if (!all || !address.trim()) return null;
  const hits = all.filter((d) => sameHome(address, d.app.propertyName ?? ""));
  return hits.find((d) => !["complete", "cancelled", "archived"].includes(d.statusKey)) ?? null;
}

const dealUrlOf = (d: BusinessDeal) => propolyDealUrl(d.app.id);

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

  const rexAccepted = app.status === "accepted";
  const unsuccessful = app.status === "unsuccessful";
  /* ACCEPTED HERE COUNTS (9 Oct 2026). Rhiannon accepted Sarah Heard on 12b
     Cliff Road in the OS and the file stopped dead on "Mark it accepted in
     REX": the handover only ever started from REX's own accepted. Now the
     OS's accept moves it on to the push; REX is a reminder, not a gate. */
  const ref = `rex:${app.id}`;
  const mine =
    !rexAccepted && !unsuccessful && !app.closed
      ? app.osDecision !== undefined
        ? app.osDecision
        : ((await decisionsFor([ref]).catch(() => new Map())).get(ref) ?? null)
      : null;
  const osAccepted = mine?.decision === "accepted";
  const accepted = rexAccepted || osAccepted;

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

  /* THE AGENT'S DECISION (7 Oct 2026, James: we need to be able to reject an
     offer as well as accept it). Kept in the OS; REX is still marked by hand,
     so once it is decided here the job is to make REX say the same. REX's own
     accepted or unsuccessful always wins. */
  /* Said after the handover's own actions, so the push leads (below). */
  const decisionActions: JourneyAction[] = [];
  if (!rexAccepted && !unsuccessful && !app.closed) {
    const decisionStop = stops[stops.length - 1];
    const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });
    if (!mine) {
      decisionActions.push(
        { id: "decide-accept", label: "Accept the offer", detail: "Once the landlord has said yes. It moves onto Applications as a let in progress; mark it accepted in REX as well.", href: null, who: "you", decide: "accepted" },
        { id: "decide-decline", label: "Decline the offer", detail: "Turn it down. It stays on the listing as declined and the home keeps taking viewings and offers. The tenant isn't told automatically.", href: null, who: "you", decide: "declined" }
      );
    } else if (mine.decision === "accepted") {
      /* Done: accepted here moves the file on. REX catches up when it can. */
      decisionStop.sub = `Accepted by ${mine.by} ${day(mine.at)}`;
      decisionStop.tone = "ok";
      decisionStop.state = "done";
      decisionActions.push({ id: "decide-rex-accept", label: "Mark it accepted in REX", detail: `Accepted here by ${mine.by} on ${day(mine.at)}. REX still has it as ${app.statusLabel.toLowerCase()} - accept it there too when you get a minute. It doesn't hold anything up.`, href: null, who: "you", minor: true });
    } else {
      decisionStop.sub = `Declined by ${mine.by} ${day(mine.at)}`;
      decisionStop.state = "off";
      decisionActions.push(
        { id: "decide-rex-decline", label: "Mark it unsuccessful in REX", detail: `Declined here by ${mine.by} on ${day(mine.at)}. REX still has it as ${app.statusLabel.toLowerCase()}; mark it unsuccessful there too.`, href: null, who: "you" },
        { id: "decide-undo", label: "Undo the decline", detail: "Puts it back to an open offer on the listing.", href: null, who: "you", decide: "undo" }
      );
    }
  }

  /* The three sources the rest reads from, in parallel. */
  const [handoff, run, plcCase, allDeals, mode, dealOn] = await Promise.all([
    buildHandoff(app).catch(() => null),
    latestHandover(app.id).catch(() => null),
    getCase(`plc-${app.id}`).catch(() => null),
    accepted ? deals() : Promise.resolve(null),
    handoverMode().catch(() => "shadow" as const),
    switchOn("handover_deal").catch(() => false),
  ]);

  const deal = accepted && allDeals ? findDeal(app, allDeals) : null;

  /* THE OTHER OFFERS, HELD (9 Oct 2026). Accepting one leaves the rest open
     until the accepted tenant's holding fee is paid, so the home is not left
     with nobody if they drop out. Once Propoly shows it paid, letting the
     others know is the first thing on the file (lib/offer-hold). */
  const fee = feeOf(deal);
  let held: Awaited<ReturnType<typeof otherOpenOffers>> = [];
  if (accepted && app.listingId != null) {
    const listingId = String(app.listingId);
    const here = (await getApplications(300).catch(() => [] as Application[])).filter((a) => String(a.listingId ?? "") === listingId);
    const closed = await closedReasons(here).catch(() => new Map<string, string>());
    held = await otherOpenOffers(listingId, ref, here, closed).catch(() => []);
  }
  const heldNames = held.map((h) => h.name).join(", ");

  /* 3. The handover: the deal existing in Propoly is the proof it happened,
     whoever did it. Our own run is the record of how. */
  let handoverStop: JourneyStop;
  if (!accepted) {
    handoverStop = { id: "handover", label: "Handover", sub: null, tone: "none", state: unsuccessful ? "off" : "upcoming" };
  } else if (deal) {
    handoverStop = { id: "handover", label: "Handover", sub: "In Propoly", tone: "ok", state: "done" };
  } else if (run?.mode === "live" && run.status === "ok") {
    handoverStop = { id: "handover", label: "Handover", sub: `In Propoly ${dayWords(run.finishedAt ?? run.startedAt)}`, tone: "ok", state: "done" };
    /* Since 9 Oct 2026 the push can start the deal too (lib/handover-deal,
       switch handover_deal). Until Propoly's deals are next read the deal
       is known from the run; with the switch off it is started by hand. */
    const started = run.steps.find((s) => s.id === "deal" && s.state === "ok");
    const startedUuid = started ? ((started.response as { uuid?: string } | null)?.uuid ?? null) : null;
    if (startedUuid) {
      actions.push({ id: "fee", label: "Waiting on the holding fee", detail: "The deal is in Propoly with the tenants on it, and the holding fee is taken from it.", href: propolyDealUrl(startedUuid), who: "tenant" });
    } else {
      actions.push({ id: "deal-start", label: "Start the deal in Propoly", detail: "The landlord and the home are in Propoly now. Start the deal there for these tenants - the holding fee is taken from the deal.", href: null, who: "kirstie" });
    }
  } else if (run?.mode === "live") {
    const failed = run.steps.find((s) => s.state === "failed" || s.state === "blocked");
    handoverStop = { id: "handover", label: "Handover", sub: failed ? `Stopped at ${failed.label.toLowerCase()}` : "Did not finish", tone: "warn", state: "current" };
    actions.push({ id: "handover", label: "Push to Propoly", detail: failed?.detail ?? "The last push did not finish. Push it again - nothing already in Propoly is made twice.", href: null, who: "you", push: true });
  } else {
    handoverStop = {
      id: "handover",
      label: "Handover",
      sub: run ? `Rehearsed ${dayWords(run.startedAt)}; not in Propoly yet` : "Not handed over yet",
      tone: "warn",
      state: "current",
    };
    /* The words follow the switch (16 Sep 2026). It said "Rehearse the
       handover below" whatever the mode, which is wrong the day it goes live:
       then the button below IS the handover. */
    actions.push(
      mode === "live"
        ? { id: "handover", label: "Push to Propoly", detail: dealOn ? "Accepted. Push it to Propoly: the landlord, the home and the deal with its tenants go over, using what Propoly already has where it has it, so nothing is duplicated." : "Accepted. Push it to Propoly: the landlord and the home go over, using the records Propoly already has where it has them, so nothing is duplicated.", href: null, who: "you", push: true }
        : { id: "handover", label: "Push to Propoly", detail: "Accepted. The push is still in practice mode, so pressing it checks every step and writes nothing.", href: null, who: "you", push: true }
    );
  }
  stops.push(handoverStop);

  /* In Propoly, fee not in: that is where it is, whoever's move it is. */
  if (deal && !fee.settled) {
    actions.push({
      id: "fee",
      label: "Waiting on the holding fee",
      detail: `The deal is in Propoly and the holding fee is taken from it.${held.length ? ` ${heldNames} ${held.length === 1 ? "is" : "are"} held until it's paid, and the home keeps taking viewings.` : ""}`,
      href: dealUrlOf(deal),
      who: "tenant",
    });
  } else if (!deal && held.length && accepted) {
    actions.push({
      id: "held",
      label: `${held.length} other offer${held.length === 1 ? "" : "s"} held`,
      detail: `${heldNames} ${held.length === 1 ? "stays" : "stay"} open until the holding fee is paid, and the home keeps taking viewings. Once it's paid you'll be asked to let them know.`,
      href: null,
      who: "tenant",
      minor: true,
    });
  }
  if (fee.settled && held.length) {
    actions.unshift({
      id: "release",
      label: "Let the other applicants know",
      detail: `${fee.words}${fee.paidAt ? ` ${dayWords(fee.paidAt)}` : ""}. ${heldNames} ${held.length === 1 ? "is" : "are"} still held on this home. Let them go and you'll get a "not this one" to read and send to each.`,
      href: null,
      who: "you",
      release: held.length,
    });
  }
  actions.push(...decisionActions);
  /* Undo an accept only while nothing has gone to Propoly for it. */
  if (osAccepted && run?.mode !== "live" && !deal) {
    actions.push({ id: "decide-undo", label: "Undo the accept", detail: "Puts it back to an open offer on the listing.", href: null, who: "you", decide: "undo", minor: true });
  }

  /* What the packet says is short - these are the agent's jobs whatever stage it is at. */
  if (handoff) {
    if (!handoff.landlord) {
      actions.push({ id: "landlord", label: "Add the landlord to the listing", detail: "No landlord is on the listing, so there is nobody to set up in Propoly or email.", href: null, who: "you" });
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
  let flatbond: ReturnType<typeof flatbondForDeal> = null;
  let plcInfo: ApplicationJourney["plc"] = null;
  if (deal) {
    const [overlays, m, flatbonds] = await Promise.all([
      getOverlays([deal.app.id]).catch(() => new Map()),
      money(),
      loadFlatbonds().catch(() => []),
    ]);
    flatbond = flatbondForDeal(deal, flatbonds);
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
          flatbond?.done === true ||
          meta?.checklist?.deposit_registered?.done === true ||
          Boolean(meta?.depositScheme) ||
          Boolean(journeyMoney?.tenancy?.depositId),
        rentIn: Boolean(journeyMoney?.rentReceived),
        agreementSigned: deal.app.propoly?.agreement?.status === "signed",
      },
      meta
    );
    const currentIdx = Math.max(0, PORTAL_STAGES.findIndex((s) => s.key === stageKey));
    const evidenceDeal = m
      ? { ...moneyForDeal(m, deal.app.propertyName, deal.app.startDate), startDate: deal.app.startDate, app: deal.app, flatbond }
      : { startDate: deal.app.startDate, app: deal.app, flatbond };
    dealInfo = { id: deal.app.id, stage: stageKey, url: propolyDealUrl(deal.app.id) };

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
    } else if (plcCase.state === "submitted" || plcCase.state === "scanning" || plcCase.state === "reviewing" || plcCase.state === "checked") {
      actions.push({ id: "plc-wait", label: "PLC pack is with compliance", detail: `${st?.label ?? plcCase.state} - nothing for you until compliance answer.`, href: null, who: "kirstie" });
    } else if (plcCase.state === "approved" && deal?.app.propoly?.depositReplacement) {
      /* PLC passed, and the deal is on Flatfair rather than a cash deposit.
         Kirstie (4 Sep): the agent keys it into Flatfair by hand and she
         cannot generate the agreement until it is done. The tick is the
         deal's "deposit registered" item, read from the same overlay the
         board reads. Until Flatfair's API exists this is the step. */
      const meta = await getMeta(deal.app.id).catch(() => null);
      const tick = meta?.checklist?.deposit_registered;
      /* Once Flatfair holds the deal (2 Oct 2026) it has been keyed in: the
         tick is no longer the only way to know. */
      if (!tick?.done && !flatbond) {
        actions.push({ id: "flatfair", label: "Set the deal up in Flatfair", detail: "PLC passed. Key it into Flatfair, then tick it done so Kirstie can generate the agreement.", href: `/applications/flatfair?deal=${encodeURIComponent(deal.app.id)}`, who: "you" });
      }
    }
    /* PLC passed: the rest of the deal is finished IN PROPOLY, by the agent
       (Howard, 15 Sep 2026). Propoly exposes no write for moving a deal on,
       so the OS cannot do it - and a screen that goes quiet after "approved"
       leaves the agent guessing whether anything else is theirs. Said
       plainly, with the deal one click away, until Propoly shows the deal
       past the PLC stop. */
    const plcStop = PORTAL_STAGES.findIndex((x) => x.key === "plc");
    const dealAt = dealInfo ? PORTAL_STAGES.findIndex((x) => x.key === dealInfo!.stage) : -1;
    if (plcCase.state === "approved" && dealInfo && dealAt <= plcStop) {
      actions.push({
        id: "propoly-finish",
        label: "Finish the deal in Propoly",
        detail: "The PLC passed. The OS can't move the deal on in Propoly - Propoly doesn't allow it - so open the deal there and carry on. This goes away once Propoly shows it past the PLC.",
        href: dealInfo.url,
        who: "you",
      });
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

/**
 * Where each application actually is, for a LIST.
 *
 * journeyFor() is the truth, and it is expensive - a handoff, a handover run,
 * a PLC case and Propoly's deals, per application. Asking it 157 times to
 * fill a column is not on. This answers the same question with one call.
 *
 * James, 10 Sep 2026: "we don't want communicated, we want where they are in
 * that process... 'Accepted' is great, but where is accepted?" REX's four
 * statuses answer "has the landlord said yes", which is a real question for
 * the two ends and no answer at all in the middle. So the ends keep REX's
 * word, and an accepted application is described by its DEAL, which is where
 * it has actually got to.
 *
 * An accepted application with no deal is not a stage, it is a job: nothing
 * was handed over.
 */
export async function stageLabels(apps: Application[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  /* Accepted here counts as accepted (9 Oct 2026), as on the file itself. */
  const isAccepted = (a: Application) => a.status === "accepted" || a.osDecision?.decision === "accepted";
  const accepted = apps.filter(isAccepted);
  const all = accepted.length ? await deals().catch(() => null) : null;

  for (const a of apps) {
    if (a.status === "unsuccessful") { out.set(a.id, "Unsuccessful"); continue; }
    if (!isAccepted(a) && a.status === "received") { out.set(a.id, "Not put to landlord"); continue; }
    if (!isAccepted(a) && a.status === "communicated") { out.set(a.id, "Landlord decision"); continue; }
    const deal = all ? findDeal(a, all) : null;
    out.set(a.id, deal ? dealStatusLabel(deal.statusKey) : all ? "Handover due" : "Accepted");
  }
  return out;
}
