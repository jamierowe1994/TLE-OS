import { houseKeyOf, parseAddress, sameHome } from "@/lib/address-parse";
import type { Application } from "@/lib/applications";
import { decisionsFor } from "@/lib/offer-decisions";
import { buildHandoff } from "@/lib/deal-handoff";
import { handoverMode, handoversFor } from "@/lib/handover";
import { getCase } from "@/lib/plc-store";
import { PLC_STATES, caseIdFor } from "@/lib/plc";
import { dealStatusLabel, getAllPropolyDeals, getPropolyCompletes, type BusinessDeal, type CompletedDeal } from "@/lib/business/propoly-deals";
import { getOverlays, getMeta } from "@/lib/business/deal-store";
import { derivePortalStage } from "@/lib/business/deal-stage";
import { eventsForDeal } from "@/lib/business/deal-watch";
import type { DealEvent } from "@/lib/business/deal-events";
import { loadMoneyContext, moneyForDeal, type MoneyContext } from "@/lib/business/deal-money";
import { stageEvidence } from "@/lib/business/stage-evidence";
import { withoutDuplicates } from "@/lib/business/deal-dupes";
import { flatbondForDeal, loadFlatbonds } from "@/lib/business/flatfair-deal";
import { PORTAL_STAGES, propolyDealUrl, stagesFor } from "@/lib/business/propoly-stages";
import { isScottish } from "@/lib/property-flags";
import { switchOn } from "@/lib/switches";
import { heldForTenantChanges, referencedOn } from "@/lib/tenant-swaps";
import { q } from "@/lib/db";
import { closedReasons, getApplications } from "@/lib/applications";
import { feeOf, otherOpenOffers } from "@/lib/offer-hold";
import { advertFor, stageReached } from "@/lib/advert-offline";
import { introOnlyIds, isIntroOnly } from "@/lib/intro-only";

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
  /** Take the advert offline: the stage the agent picked has come (lib/advert-offline). */
  offline?: boolean;
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
  /** In Propoly, however it got there - the chip at the top of the let. */
  inPropoly: { url: string | null; how: "open" | "finished" | "pushed" | "found" } | null;
  /** Every move the watcher recorded on the deal, newest first. */
  history: DealEvent[];
  /** Intro only (16 Oct 2026, lib/intro-only): the file ends once the tenant
   *  is agreed. `done` once they are. Null on every other service. */
  introOnly?: { done: boolean } | null;
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

function findDeal(app: Application, all: BusinessDeal[], pushed?: string | null): BusinessDeal | null {
  /* The deal our own push started is this let's, whatever either side calls
     the address (16 Oct 2026, 285/5 Leith Walk). */
  const own = pushed ? all.find((d) => d.app.id === pushed) : null;
  if (own) return own;
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

/* ── Already in Propoly, whoever put it there ─────────────────────────────
   James, 12 Oct 2026: "we should do a sweep to check whether they are
   properly already on ... if they're accepted and they are in Propoly, it
   should shift it over ... What I don't want to do is get properties stuck."

   The match above runs on every read against Propoly's own deals, re-read
   every few minutes - so it already IS the sweep, for a deal still open.
   Two kinds were never found, and sat under "to hand over" for good:
     - a deal Propoly has FINISHED. Its open list drops it, so 26 Garland
       Road (moved in 8 Oct) and Room 2, 5b Newton Road (9 Oct) still asked
       to be pushed. Finished deals are their own hourly copy, read here.
     - a tenant swap keyed into Propoly by hand. Only our own push counted,
       because the home's old deal is the tenancy being changed. A deal on the
       home with a joiner on it is the new one.
   Both match only on what can't be someone else's let, so a let still being
   keyed in is never moved on early: nothing found, it stays to hand over. */

let completesCache: { at: number; rows: CompletedDeal[] | null } | null = null;
async function completes(): Promise<CompletedDeal[] | null> {
  if (completesCache && Date.now() - completesCache.at < KEEP_MS) return completesCache.rows;
  const rows = await getPropolyCompletes().catch(() => null);
  if (rows) completesCache = { at: Date.now(), rows };
  return rows;
}

const DAY_MS = 86_400_000;
const dayNum = (iso: string | null | undefined) => {
  const t = iso ? Date.parse(iso.slice(0, 10)) : NaN;
  return Number.isNaN(t) ? null : t / DAY_MS;
};

/**
 * A deal Propoly has finished for this let. The same home - the flat itself
 * when Propoly names it, else the same house (postcode, door, street) at the
 * same rent, which tells rooms in one house apart - moving in within three
 * weeks of the agreed date, and not before the offer was accepted (the last
 * tenant's move-in is not this one's).
 */
export function findCompleted(app: Application, rows: CompletedDeal[]): CompletedDeal | null {
  const address = [app.property, app.locality].filter(Boolean).join(", ");
  const house = houseKeyOf(address);
  const start = dayNum(app.startDate);
  const acceptedOn = dayNum(app.dateAccepted ?? app.osDecision?.at ?? app.dateReceived);
  const rent = app.offerAmount && /month/i.test(app.offerPeriod ?? "month") ? app.offerAmount : null;
  const fits = rows.filter((c) => {
    const on = dayNum(c.date);
    if (!c.address || on == null) return false;
    if (acceptedOn != null && on < acceptedOn - 3) return false;
    if (start != null && Math.abs(on - start) > 21) return false;
    if (start == null && acceptedOn == null) return false;
    if (sameHome(address, c.address)) return true;
    /* Propoly gave the house only ("26 Garland Road"): the house must agree
       and so must the rent. */
    if (parseAddress(c.address).unit != null || !house || houseKeyOf(c.address) !== house) return false;
    return rent != null && c.rentPcm != null && Math.abs(c.rentPcm - rent) <= Math.max(1, rent * 0.02);
  });
  if (!fits.length) return null;
  return fits.sort((a, b) => Math.abs((dayNum(a.date) ?? 0) - (start ?? 0)) - Math.abs((dayNum(b.date) ?? 0) - (start ?? 0)))[0];
}

/** A tenant swap's new deal, keyed into Propoly by hand: an open deal on the home with someone joining on it. */
export function findSwapDeal(app: Application, all: BusinessDeal[]): BusinessDeal | null {
  if (!app.swap || !app.property?.trim()) return null;
  /* Who the new deal is for: those joining, or on a re-reference (19 Oct
     2026) the tenants being referenced again. */
  const again = new Set((app.swap.rereference ?? []).map((n) => n.trim().toLowerCase()));
  const joiners = app.swap.joining.length ? app.applicants.slice(0, app.swap.joining.length) : app.applicants.filter((p) => again.has(p.name.trim().toLowerCase()));
  const emails = new Set(joiners.map((p) => (p.email ?? "").trim().toLowerCase()).filter(Boolean));
  const names = new Set(joiners.map((p) => p.name.trim().toLowerCase()).filter(Boolean));
  return (
    all.find(
      (d) =>
        !["complete", "cancelled", "archived"].includes(d.statusKey) &&
        sameHome(app.property, d.app.propertyName ?? "") &&
        d.app.tenants.some((t) => emails.has((t.email ?? "").trim().toLowerCase()) || names.has(t.name.trim().toLowerCase()))
    ) ?? null
  );
}

/**
 * The Propoly deal for an application, from the same five-minute copy the
 * journey reads. For the holding fee on a listing's other offers (lib/offer-
 * hold). Null when the deal isn't in Propoly or Propoly couldn't be read.
 */
export async function dealForApplication(app: Application): Promise<BusinessDeal | null> {
  const [all, runs] = await Promise.all([deals(), handoversFor(app.id, 10).catch(() => [])]);
  const live = runs.find((r) => r.mode === "live" && r.status === "ok");
  return all ? findDeal(app, all, live ? pushedDealOf(live.steps) : null) : null;
}

/** The deal a finished live push started, from its "deal" step. */
function pushedDealOf(steps: { id: string; state: string; response?: unknown }[]): string | null {
  return (steps.find((x) => x.id === "deal" && x.state === "ok")?.response as { uuid?: string } | null)?.uuid ?? null;
}

/** Every application's pushed deal, in one read, for a list. */
async function pushedDeals(): Promise<Map<string, string>> {
  const rows = await q<{ application_id: string; steps: { id: string; state: string; response?: unknown }[] }>(
    `SELECT application_id, steps FROM os_handovers WHERE mode = 'live' AND status = 'ok' ORDER BY started_at`
  ).catch(() => []);
  const out = new Map<string, string>();
  for (const r of rows) {
    const uuid = Array.isArray(r.steps) ? pushedDealOf(r.steps) : null;
    if (uuid) out.set(r.application_id, uuid);
  }
  return out;
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

/* ── intro only (lib/intro-only) ───────────────────────────────────────── */

/** The last stop on an intro-only let: the landlord's yes is the end of it. */
export function introStop(accepted: boolean, unsuccessful = false): JourneyStop {
  return {
    id: "intro",
    label: "Intro only",
    sub: unsuccessful ? null : accepted ? "Tenant introduced - nothing more to do" : "Ends once the landlord agrees the tenant",
    tone: accepted ? "ok" : "none",
    state: unsuccessful ? "off" : accepted ? "done" : "upcoming",
  };
}

export const INTRO_INVOICE: JourneyAction = {
  id: "intro-invoice",
  label: "Invoice the landlord for the introduction",
  detail: "It's an intro only, so this is the last step: the landlord takes it from here - referencing, the agreement, the deposit and the move-in are theirs. Nothing goes to Kirstie or Propoly.",
  href: null,
  who: "you",
};

/**
 * A test file's journey, cut down the same way when its listing is marked
 * intro only, so a tester can walk one: the offer, the landlord's yes, and
 * the end. The test's own Accept and Decline stay.
 */
export function introOnlyTestJourney(j: ApplicationJourney, accepted: boolean): ApplicationJourney {
  const stops = j.stops.filter((x) => x.id === "received" || x.id === "decision");
  stops.push(introStop(accepted));
  const actions = j.actions.filter((a) => a.test === "accept" || a.test === "decline" || a.decide);
  if (accepted) actions.push(INTRO_INVOICE);
  return { ...j, stops, actions, flags: [], deal: null, plc: null, handover: null, inPropoly: null, history: [], introOnly: { done: accepted } };
}

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
  const ref = app.id.startsWith("os:") ? app.id : `rex:${app.id}`;
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

  /* INTRO ONLY (training call, 16 Oct 2026): we advertise, market and find
     the tenant; the landlord does the rest. So the file ends at the
     landlord's yes - no handover, no Propoly, no PLC, no certificates to
     chase, no holding fee. The agent invoices for the introduction and that
     is the last thing the OS asks of anybody. */
  if (!app.swap && (await isIntroOnly(app.listingId).catch(() => false))) {
    stops.push(introStop(accepted, unsuccessful));
    if (accepted && app.listingId != null) {
      /* No holding fee to wait for, so the other offers can go now. */
      const listingId = String(app.listingId);
      const here = (await getApplications(300).catch(() => [] as Application[])).filter((a) => String(a.listingId ?? "") === listingId);
      const closed = await closedReasons(here).catch(() => new Map<string, string>());
      const others = await otherOpenOffers(listingId, ref, here, closed).catch(() => []);
      if (others.length) {
        actions.push({
          id: "release",
          label: "Let the other applicants know",
          detail: `${others.map((h) => h.name).join(", ")} ${others.length === 1 ? "is" : "are"} still open on this home. Let them go and you'll get a "not this one" to read and send to each.`,
          href: null,
          who: "you",
          release: others.length,
        });
      }
    }
    if (accepted) actions.push(INTRO_INVOICE);
    actions.push(...decisionActions);
    if ((osAccepted || app.id.startsWith("os:")) && !rexAccepted) {
      actions.push({ id: "decide-undo", label: "Undo the accept", detail: "Puts it back to an open offer on the listing.", href: null, who: "you", decide: "undo", minor: true });
    }
    return { stops, actions, flags, deal: null, plc: null, handover: null, inPropoly: null, history: [], introOnly: { done: accepted } };
  }

  /* The three sources the rest reads from, in parallel. */
  const [handoff, run, plcCase, allDeals, switchMode, dealOn, changeHeld] = await Promise.all([
    buildHandoff(app).catch(() => null),
    /* The push that went, over any rehearsal run after it: a rehearsal
       after a live push made the let read "not in Propoly yet" and offered
       Push to Propoly again, which on a swap starts a second deal. */
    handoversFor(app.id, 10).then((runs) => runs.find((r) => r.mode === "live" && r.status === "ok") ?? runs[0] ?? null).catch(() => null),
    /* The pack's id is the application's with anything but letters, digits
       and dashes made a dash (lib/plc caseIdFor): "swap:g2h4..." is kept as
       "plc-swap-g2h4...". Read as "plc-swap:g2h4..." it was never found, so a
       swap or an OS offer said "Start the PLC check" over a pack already
       started, sent or passed (Lianna, 16 Oct 2026, 44 South Bridge). */
    getCase(caseIdFor(app.id)).catch(() => null),
    /* Read even before the offer is accepted (13 Oct 2026): a let keyed
       into Propoly by hand still shows as in Propoly. */
    deals().catch(() => null),
    handoverMode().catch(() => "shadow" as const),
    switchOn("handover_deal").catch(() => false),
    heldForTenantChanges(app).catch(() => true),
  ]);
  /* An add or a re-reference pushes for real only once tenant_changes_live
     is on; until then its button rehearses, and says so (lib/tenant-swaps). */
  const mode = changeHeld ? ("shadow" as const) : switchMode;
  /* Who a change of tenants sends for referencing (19 Oct 2026: on a
     re-reference nobody joins, so "the newcomer" was a blank). */
  const refs = app.swap ? referencedOn(app.swap) : null;
  const refNames = refs?.referenced.join(", ") || "the new tenants";

  /* A tenant swap's home already has a deal - the tenancy being changed - so
     only the new one counts: the deal its own push started, or one keyed in
     by hand with a joiner on it (lib/tenant-swaps). */
  const pushedUuid = run?.mode === "live" && run.status === "ok" ? pushedDealOf(run.steps) : null;
  const deal = accepted && allDeals ? (app.swap ? findSwapDeal(app, allDeals) : findDeal(app, allDeals, pushedUuid)) : null;
  /* SCOTLAND TAKES NO HOLDING FEE (James, 16 Oct 2026): it isn't required
     there and neither Scottish agent takes one. The push already sends none,
     but Propoly fills in its own on every deal started from the OS, so 285/5
     Leith Walk sat behind a fee nobody was going to pay. The stop comes off
     the track; if Propoly put one on, the step is taking it off. */
  const scotland = !app.swap && isScottish(app.locality, app.property);
  const track = stagesFor(scotland);
  /* Not open in Propoly: finished there, perhaps (12 Oct 2026). */
  const finished = accepted && !deal && !app.swap ? findCompleted(app, (await completes()) ?? []) : null;

  /* THE OTHER OFFERS, HELD (9 Oct 2026). Accepting one leaves the rest open
     until the accepted tenant's holding fee is paid, so the home is not left
     with nobody if they drop out. Once Propoly shows it paid, letting the
     others know is the first thing on the file (lib/offer-hold). */
  const fee = feeOf(deal);
  let held: Awaited<ReturnType<typeof otherOpenOffers>> = [];
  if (accepted && app.listingId != null && !app.swap) {
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
  } else if (finished) {
    handoverStop = { id: "handover", label: "Handover", sub: `Moved in ${dayWords(finished.date) ?? ""} in Propoly`.replace("  ", " "), tone: "ok", state: "done" };
  } else if (run?.mode === "live" && run.status === "ok") {
    handoverStop = { id: "handover", label: "Handover", sub: `In Propoly ${dayWords(run.finishedAt ?? run.startedAt)}`, tone: "ok", state: "done" };
    /* Since 9 Oct 2026 the push can start the deal too (lib/handover-deal,
       switch handover_deal). Until Propoly's deals are next read the deal
       is known from the run; with the switch off it is started by hand. */
    const started = run.steps.find((s) => s.id === "deal" && s.state === "ok");
    const startedUuid = started ? ((started.response as { uuid?: string } | null)?.uuid ?? null) : null;
    if (startedUuid && app.swap) {
      /* A swap has no holding fee (James, 13 Oct 2026): the deal goes to
         referencing for the newcomer once Propoly's deals are next read. */
      const n = refs?.referenced.length ?? 0;
      const rest = refs?.notReferenced.length ? ` ${refs.notReferenced.join(", ")} ${refs.notReferenced.length === 1 ? "is" : "are"} on the deal with no references.` : "";
      actions.push({ id: "swap-refs", label: app.swap.joining.length ? "Referencing the new tenant" : "Referencing the tenants", detail: `The new deal is in Propoly. ${refNames} ${n === 1 ? "is" : "are"} referenced.${rest}`, href: propolyDealUrl(startedUuid), who: "tenant" });
    } else if (startedUuid && scotland) {
      actions.push({ id: "scot-fee", label: "Take the holding fee off in Propoly", detail: "Scotland takes no holding fee, but Propoly puts its own on every deal started from the OS. Set it to not required, check the deposit, then start referencing.", href: propolyDealUrl(startedUuid), who: "kirstie" });
    } else if (startedUuid) {
      actions.push({ id: "fee", label: "Waiting on the holding fee", detail: "The deal is in Propoly with the tenants on it, and the holding fee is taken from it.", href: propolyDealUrl(startedUuid), who: "tenant" });
    } else {
      actions.push({ id: "deal-start", label: "Start the deal in Propoly", detail: scotland ? "The landlord and the home are in Propoly now. Start the deal there for these tenants - there's no holding fee in Scotland, so set it to not required." : "The landlord and the home are in Propoly now. Start the deal there for these tenants - the holding fee is taken from the deal.", href: null, who: "kirstie" });
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
        : changeHeld && refs
          ? { id: "handover", label: "Push to Propoly", detail: `This change of tenants is in practice mode for now, so pressing it checks every step and writes nothing. Start the new deal in Propoly by hand meanwhile: everyone on it, only ${refNames} referenced, holding fee not required.`, href: null, who: "you", push: true }
          : { id: "handover", label: "Push to Propoly", detail: "Accepted. The push is still in practice mode, so pressing it checks every step and writes nothing.", href: null, who: "you", push: true }
    );
  }
  stops.push(handoverStop);

  /* A TENANT SWAP HAS NO HOLDING FEE (James, 13 Oct 2026: "holding deposits
     and things like that ... all sorted out externally"). The push sends a
     fee of nothing, but Propoly fills in its own week's rent when it is sent
     nothing - 44 South Bridge sat at Start deal with £762 due on 12 Oct. Set
     to "not required" in Propoly, the deal moves on to referencing, as the
     swaps Kirstie keys in by hand do. */
  if (deal && scotland && !fee.settled) {
    const due = deal.app.propoly?.holdingFee ?? null;
    actions.push({
      id: "scot-fee",
      label: "Take the holding fee off in Propoly",
      detail: `Scotland takes no holding fee, but Propoly puts its own on every deal started from the OS (${due ? `£${Math.round(due).toLocaleString("en-GB")} here` : "a week's rent"}) - it can't be switched off from outside Propoly. Set the holding fee to not required, check the deposit, then start referencing.${held.length ? ` ${heldNames} ${held.length === 1 ? "is" : "are"} held until then.` : ""}`,
      href: dealUrlOf(deal),
      who: "kirstie",
    });
  } else if (deal && app.swap && !fee.settled) {
    const due = deal.app.propoly?.holdingFee ?? null;
    actions.push({
      id: "swap-fee",
      label: "Take the holding fee off in Propoly",
      detail: `${app.swap.kind === "add" ? "Adding a tenant takes" : app.swap.kind === "rereference" ? "A re-reference takes" : "A tenant swap takes"} no holding fee, but Propoly puts its own on every deal started from the OS (${due ? `£${Math.round(due).toLocaleString("en-GB")} here` : "a week's rent"}) - it can't be switched off from outside Propoly. Set the holding fee to not required, check the deposit, then start referencing for ${refNames}.`,
      href: dealUrlOf(deal),
      who: "kirstie",
    });
  } else if (deal && !fee.settled) {
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
      detail: scotland
        ? `${heldNames} ${held.length === 1 ? "stays" : "stay"} open until the deal is through to referencing in Propoly, and the home keeps taking viewings. Then you'll be asked to let them know.`
        : `${heldNames} ${held.length === 1 ? "stays" : "stay"} open until the holding fee is paid, and the home keeps taking viewings. Once it's paid you'll be asked to let them know.`,
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
  /* Undo an accept only while nothing has gone to Propoly for it. An offer
     accepted in the OS is an application of its own (lib/applications). */
  if ((osAccepted || app.id.startsWith("os:")) && run?.mode !== "live" && !deal) {
    actions.push({ id: "decide-undo", label: "Undo the accept", detail: "Puts it back to an open offer on the listing.", href: null, who: "you", decide: "undo", minor: true });
  }

  /* What the packet says is short - these are the agent's jobs whatever stage it is at. */
  if (handoff && !app.swap) {
    if (!handoff.landlord) {
      actions.push({ id: "landlord", label: "Add the landlord to the listing", detail: "No landlord is on the listing, so there is nobody to set up in Propoly or email.", href: null, who: "you" });
    }
    if (app.rightToRentIncomplete) {
      actions.push({ id: "rtr", label: "Record right to rent", detail: "Not recorded for every applicant on the application.", href: null, who: "you" });
    }
    for (const m of handoff.missing) {
      /* Let only (Sean, 15 Oct 2026, an intro-only on St Tridunana's Rest):
         the certificates are the landlord's to keep, and Compliance leaves
         let-only homes out, so "Get the Gas safety" sent him to a page that
         did not have the home on it. On a let only it is a copy to ask the
         landlord for, and it goes on the PLC check. */
      actions.push(
        handoff.letOnly
          ? {
              id: `cert:${m.id}`,
              label: `Ask the landlord for the ${m.label}`,
              detail: `${m.why} It's a let only, so keeping it in date is the landlord's job, but the PLC check needs a copy before the tenancy starts. Add it there when it comes in.`,
              href: `/plc/start?application=${encodeURIComponent(app.id)}`,
              who: "landlord",
            }
          : { id: `cert:${m.id}`, label: `Get the ${m.label}`, detail: m.why, href: "/compliance", who: "landlord" }
      );
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
    const currentIdx = Math.max(0, track.findIndex((s) => s.key === stageKey));
    const evidenceDeal = m
      ? { ...moneyForDeal(m, deal.app.propertyName, deal.app.startDate), startDate: deal.app.startDate, app: deal.app, flatbond }
      : { startDate: deal.app.startDate, app: deal.app, flatbond };
    dealInfo = { id: deal.app.id, stage: stageKey, url: propolyDealUrl(deal.app.id) };

    track.forEach((s, i) => {
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
    track.forEach((s, i) => {
      stops.push({
        id: s.key,
        label: s.label,
        sub: i === 0 && accepted ? "Not in Propoly yet" : null,
        tone: "none",
        state: unsuccessful ? "off" : "upcoming",
      });
    });
  }

  /* A swap has no holding fee: the stop says so rather than waiting on one
     (13 Oct 2026). If Propoly put one on, it says that instead. */
  if (app.swap) {
    const hf = stops.find((x) => x.id === "holding_fee");
    if (hf && hf.state !== "done") {
      const due = deal && !fee.settled ? deal.app.propoly?.holdingFee ?? null : null;
      if (due) Object.assign(hf, { sub: `Propoly put £${Math.round(due).toLocaleString("en-GB")} on - take it off`, tone: "warn" });
      else Object.assign(hf, { sub: app.swap.kind === "add" ? "None when adding a tenant" : app.swap.kind === "rereference" ? "None on a re-reference" : "None on a tenant swap", tone: "none", state: "off" });
    }
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
  } else if (accepted && !finished) {
    actions.push({ id: "plc-start", label: "Start the PLC check", detail: "The pre-let compliance pack has not been started for this let.", href: `/plc/start?application=${encodeURIComponent(app.id)}`, who: "you" });
  }

  /* The deal's own history, from the watcher. The same rows Kirstie's feed
     shows, scoped to this one deal, so "where's this up to" is answered on
     the application itself rather than by asking her. */
  const history = deal ? await eventsForDeal(deal.app.id).catch(() => []) : [];

  /* IN PROPOLY, for the chip at the top of the let (James, 13 Oct 2026: "do
     a check to see if it's already on Propoly"). Accepted: the deal, a
     finished deal, or our own push. Not accepted yet: a deal at this home
     only counts when one of its tenants is one of these applicants, so
     another applicant's deal on the same house is never taken for this one. */
  const norm = (x: string | null | undefined) => (x ?? "").toLowerCase().replace(/[^a-z@.]+/g, " ").trim();
  const loose = !accepted && allDeals ? findDeal(app, allDeals) : null;
  const sharesTenant =
    loose != null &&
    loose.app.tenants.some((t) =>
      app.applicants.some((a) => (a.email && t.email && norm(a.email) === norm(t.email)) || (norm(a.name) !== "" && norm(a.name) === norm(t.name)))
    );
  const inPropoly: ApplicationJourney["inPropoly"] = deal
    ? { url: dealUrlOf(deal), how: "open" }
    : finished
      ? { url: finished.uuid ? propolyDealUrl(finished.uuid) : null, how: "finished" }
      : run?.mode === "live" && run.status === "ok"
        ? { url: pushedUuid ? propolyDealUrl(pushedUuid) : null, how: "pushed" }
        : sharesTenant && loose
          ? { url: dealUrlOf(loose), how: "found" }
          : null;

  /* THE ADVERT (19 Oct 2026, lib/advert-offline). The agent picked the stage
     to be asked at; once it comes, and while the advert is still up, taking it
     offline is the first thing on the file. Asked, never done for them. */
  if (accepted && app.listingId != null && !app.swap) {
    const advert = await advertFor(String(app.listingId)).catch(() => null);
    if (advert && !advert.offlineAt && advert.when && advert.when !== "manual") {
      const refAt = PORTAL_STAGES.findIndex((x) => x.key === "referencing");
      const at = dealInfo ? PORTAL_STAGES.findIndex((x) => x.key === dealInfo!.stage) : -1;
      /* Scotland takes no holding fee: there "the money's in" is the deal being in Propoly. */
      const feeIn = fee.settled || (scotland && dealInfo != null);
      if (stageReached(advert.when, { feeSettled: feeIn, pastReferencing: refAt >= 0 && at > refAt })) {
        actions.unshift({
          id: "offline",
          label: "Take the advert offline",
          detail: `${advert.when === "fee" ? (fee.settled ? "The holding fee is in" : "The deal is in Propoly") : "Referencing is done"}, which is when you asked to be told. It stays on the portals until you take it off.`,
          href: null,
          who: "you",
          offline: true,
        });
      }
    }
  }

  return { stops, actions, flags, deal: dealInfo, plc: plcInfo, handover: run ? { mode: run.mode, status: run.status, at: run.startedAt } : null, inPropoly, history };
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
  const [all, done, pushed] = accepted.length ? await Promise.all([deals().catch(() => null), completes(), pushedDeals()]) : [null, null, new Map<string, string>()];
  const intro = await introOnlyIds().catch(() => new Set<string>());
  /* Only a live push that finished counts: a blocked one leaves it waiting. */
  const swapsPushed = apps.some((a) => a.swap)
    ? new Set((await q<{ application_id: string }>(`SELECT DISTINCT application_id FROM os_handovers WHERE mode = 'live' AND status = 'ok' AND application_id LIKE 'swap:%'`).catch(() => [])).map((r) => r.application_id))
    : new Set<string>();

  for (const a of apps) {
    if (a.status === "unsuccessful") { out.set(a.id, "Unsuccessful"); continue; }
    if (!isAccepted(a) && a.status === "received") { out.set(a.id, "Not put to landlord"); continue; }
    if (!isAccepted(a) && a.status === "communicated") { out.set(a.id, "Landlord decision"); continue; }
    /* Intro only ends at the landlord's yes (lib/intro-only): never "Handover due". */
    if (!a.swap && a.listingId != null && intro.has(String(a.listingId))) { out.set(a.id, "Intro only"); continue; }
    /* A swap's home has the old tenancy's deal: its own shows up once pushed. */
    if (a.swap) {
      const keyed = all ? findSwapDeal(a, all) : null;
      out.set(a.id, keyed ? dealStatusLabel(keyed.statusKey) : swapsPushed.has(a.id) ? "In Propoly" : all ? "Handover due" : "Accepted");
      continue;
    }
    const deal = all ? findDeal(a, all, pushed.get(a.id)) : null;
    if (deal) { out.set(a.id, dealStatusLabel(deal.statusKey)); continue; }
    /* Not open in Propoly: finished there, perhaps. */
    if (done && findCompleted(a, done)) { out.set(a.id, "Moved in"); continue; }
    out.set(a.id, all ? "Handover due" : "Accepted");
  }
  return out;
}
