import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { getAllPropolyDeals, getPropolyMoveInForecast } from "@/lib/business/propoly-deals";
import {
  getBusinessPhotoIndex,
  matchListingConfident,
  matchListingPhoto,
  getComplianceForProperties,
  type DealCompliance,
} from "@/lib/business/rex-stats";
import { getOverlays } from "@/lib/business/deal-store";
import { derivePortalStage, loadStageSources, stageFactsFor } from "@/lib/business/deal-stage";
import { getPortfolioBook, propertyKey } from "@/lib/business/payprop-portfolio";
import { getTobRegister, type TobStatus } from "@/lib/business/rex-esign";
import { loadMoneyContext, moneyForDeal } from "@/lib/business/deal-money";
import { PORTAL_STAGES, portalStageOf } from "@/lib/business/propoly-stages";
import type { DealPortalOverlay } from "@/lib/business/types";

// GET /api/pretenancy/deals — every Propoly deal across all TLE agents with
// the portal overlay (notes, stage moves, checklist) merged in, plus the
// headline numbers for the top of Kirstie's dashboard. Gate: pre-tenancy
// role or admin (Susan can look over Kirstie's board).

// How long the board will wait on photos before rendering without them. The
// walk keeps going after this and fills the cache, so a first load that misses
// the deadline costs one photo-less render and nothing after it.
const PHOTO_DEADLINE_MS = 2_500;
// ComplianceEntries is superlinearly slow on large id sets; the board is more
// useful on time without compliance than late with it.
const COMPLIANCE_DEADLINE_MS = 4_000;

export interface PreTenancyDeal {
  // AgentApplication fields the board renders, via the same shape the agent sees
  app: import("@/lib/business/rex-stats").AgentApplication;
  /**
   * Whether the property can legally be let. Absent when the deal has no
   * CONFIDENT listing match — an address we only guessed at must not carry a
   * compliance verdict, because the wrong property's certificates are worse
   * than none.
   */
  compliance?: DealCompliance | null;
  /** Live RAW Propoly status (start_deal … cancelled). */
  statusKey: string;
  /** Move-in slipped 30+ days and not reactivated — hidden from the stages. */
  archived: boolean;
  /** PORTAL stage (8-stage pipeline) after any still-valid stage move. */
  effectiveStatusKey: string;
  agentName: string | null;
  agentEmail: string | null;
  portal: DealPortalOverlay;
  /**
   * What the landlord actually bought — "Fully managed", "Let only",
   * "Rent collect" — from PayProp, which is the only place in the estate that
   * records it reliably (562 properties, 4 blank). null means we genuinely do
   * not know: either PayProp has no matching property, or two properties share
   * this address key and disagree. It is never a guess.
   */
  serviceLevel: string | null;
  /** RLP (the business says PLC) from PayProp payment instructions. null =
   *  not recorded either way — silence, never "no cover". */
  rlp: { status: "protected" | "without"; evidence: string } | null;
  /** The live tenancy PayProp holds for this address — deposit reference and
   *  actual start date. null = no unambiguous match, not "no tenancy". */
  tenancy: { startDate: string | null; depositId: string | null } | null;
  /** Landlord Terms-of-Business signing state from REX's DocuSign log, via
   *  the matched listing. null = no envelope found for the listing. */
  tobStatus: TobStatus | null;
  /**
   * Verification checks: places where what the pipeline CLAIMS and what the
   * money systems RECORD disagree. Computed, never stored — fix the
   * underlying data and the flag clears itself on the next load.
   */
  flags: Array<{ kind: string; label: string }>;
  /** Scheme detected from WHO the deposit money is paid to in PayProp — a
   *  suggestion for the register, never written without Kirstie confirming. */
  schemeSuggestion: { scheme: string; evidence: string } | null;
  /** A "Holding deposit" invoice PayProp holds for this property. */
  holdingInvoice: { amount: number; fromDate: string | null } | null;
  /**
   * Rent that actually ARRIVED, from PayProp's Owner rows.
   *
   * The single best piece of evidence on this board and it was not on it. The
   * function has existed and worked for weeks — it is joined on the agent
   * applications route — and nothing in the OS called it at all. Both halves
   * were built; the wire was missing.
   *
   * `paidOut` false means reconciled in but the batch is not approved out,
   * which on 1 Aug 2026 was 31% of the UK agency's payments and is exactly the
   * gap Kirstie checks by hand.
   *
   * EVIDENCE, NEVER A TRIGGER. The address key behind it is deliberately loose
   * (see propertyKey), so this sits beside a stage and never advances one. A
   * wrong match here would move somebody's deal on the strength of another
   * property's money.
   *
   * null = no receipt matched OR the money reports have not loaded yet. The two
   * are told apart by `money.loaded` below, never by this field.
   */
  rentReceived: { amount: number; on: string; paidOut: boolean } | null;
  /**
   * A rent SCHEDULE starting in PayProp — a tenancy actually going live.
   *
   * The independent check on move day, which until now was Propoly's date and
   * nothing else. Propoly saying somebody moved in and PayProp having no rent
   * schedule for them is the disagreement worth seeing.
   */
  rentSchedule: { from: string; rent: number } | null;
  /**
   * Rent genuinely OWED on a tenancy that has already started.
   *
   * Only started tenancies. PayProp reports every tenant in debit, and on a
   * pre-tenancy board almost none of them have moved in yet — their "balance"
   * is an invoice raised ahead of a move-in, which payprop-income warns reads
   * identically to a late payer. Carrying those would have painted most of this
   * board as in arrears and sent Kirstie chasing rent that is not due.
   */
  arrears: { owed: number; lastPayment: string | null } | null;
}

export async function GET(req: NextRequest) {
  /* The portal allowed EITHER a PRETENANCY_EMAILS address or an admin. Here it
     is one question, asked of the role: owner, support and pretenancy hold
     see:pretenancy, and an env-var email list is not a permission system.
     Susan no longer does — she could look into Kirstie's board and never had
     cause to; her move-in numbers are a tab on her own screen. */
  if (!(await requireCapability(req, "see:pretenancy"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // The photo index starts HERE, alongside Propoly, not after it. It needs
  // nothing from the deals, and it is much the slower of the two — kicking it
  // off later just added its time to Propoly's. Timed 2 Aug 2026: Propoly ~1s,
  // the index ~10s cold, and they were running one after the other.
  const photosWork = getBusinessPhotoIndex(PHOTO_DEADLINE_MS).catch(() => null);
  // Cached an hour and non-blocking by design — it serves what it has and
  // refreshes behind. Started here so it overlaps Propoly like the photos do.
  const bookWork = getPortfolioBook().catch(() => null);
  // Same serve-stale contract as the book: these return instantly from cache
  // and refresh behind. A null register costs badges, never the board.
  const tobWork = getTobRegister().catch(() => null);
  /* Every PayProp join lives in lib/business/deal-money, so this route and the
     alert runner cannot drift apart on four date windows and a loose address
     key. Started here to overlap Propoly like the rest. */
  const now = new Date();
  const moneyWork = loadMoneyContext(now).catch(() => null);

  const [deals, forecast] = await Promise.all([
    getAllPropolyDeals().catch(() => null),
    getPropolyMoveInForecast().catch(() => null),
  ]);
  if (deals == null) {
    // Distinguish "no keys" from "cold cache didn't warm inside the deadline"
    // — the client retries the latter instead of claiming Propoly is missing.
    const { propolyConfigured } = await import("@/lib/business/propoly");
    return NextResponse.json({
      configured: propolyConfigured(),
      deals: null,
      summary: null,
    });
  }

  const overlays = await getOverlays(deals.map((d) => d.app.id));
  /* The records seven of the eight stages are read from. See deal-stage. */
  const stageSources = await loadStageSources();
  const today = new Date().toISOString().slice(0, 10);
  const THIRTY_DAYS_AGO = new Date(Date.now() - 30 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  // Propoly holds no photos, so borrow them from REX by postcode and street
  // number — the same match the agent Applications page uses. Business-wide
  // here, because Kirstie sees every agent's deals and is not an agent
  // herself, so the per-agent index has nothing to match against.
  //
  // Never blocks the board: a failed or slow index just means deals arrive
  // without a picture, which is exactly what they do today. Started above so
  // it overlaps the Propoly fetch; by here it is usually already done.
  const photos = await photosWork;
  const book = await bookWork;
  const tob = await tobWork;
  const money = await moneyWork;
  /** The register, for the verification flags below. */
  const register = money?.register ?? null;

  // Deadlined like the photos. ComplianceEntries is the slowest thing REX does,
  // and Kirstie's board must render without it rather than hang.
  /* Keyed by PROPERTY id, not listing id. REX hangs compliance entries off the
     property, and asking with a listing id matched nothing — while the call
     itself succeeded, so every property came back "checked" with no entries and
     the required-set filler reported a missing EPC, gas certificate and EICR
     against all of them. A false alarm on every deal on the board.

     Empty property ids are dropped rather than sent: a malformed REX row would
     otherwise put "" into an `in` criteria and quietly widen the query. */
  const confidentByDeal = new Map<string, string>();
  if (photos) {
    for (const d of deals) {
      const m = matchListingConfident(photos, d.app.propertyName, d.app.locality);
      if (m?.propertyId) confidentByDeal.set(d.app.id, String(m.propertyId));
    }
  }
  const compliance = await Promise.race([
    getComplianceForProperties([...confidentByDeal.values()]).catch(
      () => new Map<string, DealCompliance>()
    ),
    new Promise<Map<string, DealCompliance>>((r) =>
      setTimeout(() => r(new Map()), COMPLIANCE_DEADLINE_MS)
    ),
  ]);

  const out: PreTenancyDeal[] = deals.map((d) => {
    const entry = overlays.get(d.app.id);
    const meta = entry?.meta ?? null;
    const effective = derivePortalStage(
      d.statusKey,
      stageFactsFor(d, meta, stageSources.cases, stageSources.money),
      meta
    );
    const overlay: DealPortalOverlay = entry
      ? {
          ...entry.overlay,
          // A stage move Propoly has since overtaken is stale — don't show it.
          override: effective === portalStageOf(d.statusKey) ? null : entry.overlay.override,
        }
      : { notesCount: 0, lastNote: null, override: null, checklistDone: 0, checklistTotal: 0 };
    const match = photos ? matchListingPhoto(photos, d.app.propertyName, d.app.locality) : null;
    // Address-keyed, because a Propoly deal holds an address string and no
    // PayProp id. Keys where two properties disagree were dropped upstream, so
    // a hit here is unambiguous or it is absent.
    const key = propertyKey(d.app.propertyName);
    /* Every window and every fallback lives in deal-money now. The seven
       hand-rolled joins that were here are the same code the alert runner
       needs, and two copies of the most fragile logic in this stack would have
       drifted the first time either was touched. */
    const m = money ? moneyForDeal(money, d.app.propertyName, d.app.startDate) : null;

    // ToB rides the CONFIDENT matcher, not the photo one — the photo match
    // deliberately falls back to "same postcode, best guess", which is fine
    // for a picture and wrong for a signing status (review find).
    const confident = photos
      ? matchListingConfident(photos, d.app.propertyName, d.app.locality)
      : null;

    // ---- verification flags ----
    // Each one is claim-vs-record, and each states which side to fix. They
    // are checks, not verdicts: a flag means "look", never "wrong".
    const flags: Array<{ kind: string; label: string }> = [];
    const stageIdx = PORTAL_STAGES.findIndex((s) => s.key === effective);
    const depositStageIdx = PORTAL_STAGES.findIndex((s) => s.key === "deposit");
    const plcStageIdx = PORTAL_STAGES.findIndex((s) => s.key === "plc");
    const agreementStageIdx = PORTAL_STAGES.findIndex(
      (s) => s.key === "tenancy_agreement"
    );
    const isFlatfair =
      meta?.depositScheme?.startsWith("Flatfair") === true ||
      d.app.propoly?.depositReplacement === true;
    const live = d.statusKey !== "cancelled" && d.statusKey !== "complete";

    if (live && register) {
      // 1. Deposit claimed, PayProp never saw one. Only fires 14+ days after
      // move-in (registration lags), never on Flatfair deals, and only when
      // the register actually loaded — a cold register must not accuse.
      const claimsDeposit =
        stageIdx > depositStageIdx ||
        meta?.checklist?.deposit_registered?.done === true;
      const moveInPassed =
        d.app.startDate != null &&
        d.app.startDate <
          new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
      if (claimsDeposit && moveInPassed && !isFlatfair && !m?.tenancy?.depositId) {
        flags.push({
          kind: "deposit-unverified",
          label:
            "Marked as deposit taken, but PayProp shows no deposit registered for this property. Check the deposit was lodged — or that the PayProp tenancy is set up.",
        });
      }

      // 2. Past the PLC stage while PayProp records the property as Without
      // RLP. Legitimate when the landlord declined cover — the flag asks the
      // question rather than asserting the answer.
      if (stageIdx > plcStageIdx && m?.rlp?.status === "without") {
        flags.push({
          kind: "plc-mismatch",
          label:
            "This deal is past the PLC stage, but PayProp records the property as \"Without RLP\". If cover was sold, the PayProp instruction wording needs updating; if the landlord declined, this is fine.",
        });
      }
    }

    // 3. Deep in the pipeline with no deposit scheme recorded. The portal is
    // the only register of the scheme, so an empty entry here is a real gap,
    // not a sync problem. Needs no PayProp data, so no register gate.
    if (live && stageIdx >= agreementStageIdx && !meta?.depositScheme && !isFlatfair) {
      flags.push({
        kind: "scheme-missing",
        label:
          "No deposit scheme recorded. Pick one on the deal file — nothing else in any system records where this deposit is held.",
      });
    }
    return {
      serviceLevel: (key && book?.serviceLevelByKey[key]) || null,
      // disabledOnly evidence is excluded outright: the census found two
      // properties whose only RLP wording sits on a switched-off instruction,
      // and a dead instruction is not a statement about cover.
      rlp: m?.rlp ?? null,
      tenancy: m?.tenancy ?? null,
      /* ToB stays on the LISTING id — REX's e-sign register really is keyed
         that way. Compliance moves to the PROPERTY id, because that is what
         ComplianceEntries hangs off. The two ids living on the same match
         object is exactly how they got confused in the first place, so they
         are named at every use from here on. */
      tobStatus: (confident?.listingId && tob?.[confident.listingId]) || null,
      compliance: confident?.propertyId
        ? (compliance.get(String(confident.propertyId)) ?? null)
        : null,
      flags,
      // A Flatfair deal has no cash deposit — suggesting a scheme under the
      // "no deposit to register" note was a contradiction on screen (review).
      schemeSuggestion: isFlatfair ? null : (m?.schemeSuggestion ?? null),
      holdingInvoice: m?.holdingInvoice ?? null,
      rentReceived: m?.rentReceived ?? null,
      rentSchedule: m?.rentSchedule ?? null,
      arrears: m?.arrears ?? null,
      app: match
        ? { ...d.app, image: match.image, images: match.images, listingId: match.listingId }
        : d.app,
      statusKey: d.statusKey,
      effectiveStatusKey: effective,
      agentName: d.managerName,
      agentEmail: d.managerEmail,
      portal: overlay,
      // Archived: the move-in slipped more than 30 days and nobody has pulled
      // it back. A rule rather than a stored state — but a deal Kirstie has
      // reactivated stays out of the pile until it slips another 30 days from
      // whenever its date is next set.
      archived:
        meta?.unarchivedAt == null &&
        d.statusKey !== "complete" &&
        d.statusKey !== "cancelled" &&
        d.app.startDate != null &&
        d.app.startDate < THIRTY_DAYS_AGO,
    };
  });

  const active = out.filter(
    (d) => d.statusKey !== "cancelled" && d.statusKey !== "complete"
  );
  const summary = {
    pipelineTotal: active.length,
    byStage: PORTAL_STAGES.map((s) => ({
      key: s.key,
      label: s.label,
      count: active.filter((d) => d.effectiveStatusKey === s.key).length,
    })),
    overdue: active.filter((d) => d.app.startDate != null && d.app.startDate < today).length,
    undated: active.filter((d) => d.app.startDate == null).length,
    completedMtd: forecast?.completedMtd ?? null,
    forecastByMonth: forecast?.forecastByMonth ?? null,
    // How often the address join actually lands. PayProp records the service
    // level on 562 properties with only 4 blank, but that is the PayProp side;
    // what matters here is how many PROPOLY deals can be tied to one of them,
    // and that is a different number. Reported rather than assumed — the photo
    // index looked complete for months on exactly this kind of unmeasured join.
    serviceLevelCoverage: {
      known: active.filter((d) => d.serviceLevel != null).length,
      total: active.length,
      bookLoaded: book != null,
      ambiguousKeys: book?.serviceLevelAmbiguous.length ?? null,
    },
    /* Measured, for the same reason as the line above — "the photo index looked
       complete for months on exactly this kind of unmeasured join", and it has
       since turned out it was empty the whole time.

       `loaded` is the one that matters: without it, a board showing no rent
       against anything is indistinguishable from a board whose money reports
       have not warmed yet, and the second one is not a finding. */
    moneyCoverage: {
      loaded: money?.loaded ?? false,
      months: money?.months ?? [],
      withRent: active.filter((d) => d.rentReceived != null).length,
      withSchedule: active.filter((d) => d.rentSchedule != null).length,
      inArrears: active.filter((d) => d.arrears != null).length,
      arrearsLoaded: money?.arrearsLoaded ?? false,
      total: active.length,
    },
  };

  return NextResponse.json({ configured: true, deals: out, summary });
}
