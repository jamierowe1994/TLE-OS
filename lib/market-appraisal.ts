/**
 * The market appraisal — the landlord's journey, from booked to won.
 *
 * Split out of the leads spine deliberately. Up to the moment an appraisal is
 * BOOKED, a landlord is a lead and belongs on the Leads page. The instant the
 * confirmation goes into the diary, the work changes shape: it stops being
 * "will they talk to us" and becomes "what is this property worth and how do
 * we win it". Different question, different screen, different person's day.
 *
 * So the lead drawer hands over rather than growing a fifth section — see
 * `handoverTarget` at the bottom.
 *
 * Stage names follow the four James asked for. `awaiting_valuation` is
 * DERIVED, not stored: an appraisal whose appointment has passed with no
 * valuation recorded is chasing itself, and computing it on read means no
 * scheduler has to remember to move anything.
 */

/**
 * Six stages, thinned from nine on 23 Aug (James: "too many boxes").
 *
 * Three went, and each was absorbed rather than deleted:
 *   awaiting_valuation → a FLAG, not a stage (see needsValuation below)
 *   terms              → part of Post-appraisal
 *   ID & ownership     → part of AML & compliance
 *
 * The test each survivor passes: it is somewhere a record can genuinely SIT
 * for days. "Terms sent" is an event inside post-appraisal, not a place a file
 * lives — and a stage nothing rests in is a box that only ever reads zero.
 */
export type MaStage =
  | "booked"
  | "pre_appraisal"
  | "appraisal"
  | "post_appraisal"
  | "takeon"
  | "aml"
  | "won"
  | "lost";

export const MA_STAGES: { id: MaStage; label: string; blurb: string }[] = [
  { id: "booked", label: "Booked", blurb: "In the diary, confirmation sent." },
  { id: "pre_appraisal", label: "Pre-appraisal", blurb: "Research, comparables and the deck the landlord opens before you arrive." },
  { id: "appraisal", label: "Appraisal", blurb: "The visit itself — the presentation you show on the day." },
  { id: "post_appraisal", label: "Post-appraisal", blurb: "Figure agreed, deck sent back, follow-up set, terms out for signature." },
  { id: "takeon", label: "Take-on & photos", blurb: "The visit that produces the photographs, the description and the front image." },
  { id: "aml", label: "AML & compliance", blurb: "ID and proof of ownership, AML on the landlord, and the property's certificates." },
  { id: "won", label: "Won", blurb: "Everything clear. It becomes a listing." },
  { id: "lost", label: "Lost", blurb: "Instructed elsewhere, or not proceeding." },
];

/** The stages a record can be working through, for the tab strip. */
export const OPEN_STAGES = MA_STAGES.filter((s) => s.id !== "won" && s.id !== "lost");

export interface MarketAppraisal {
  id: string;
  /** The lead this came from, so the handover is traceable both ways. */
  leadId: string | null;
  landlord: string;
  address: string;
  postcode: string;
  agent: string | null;
  /** ISO. Null means booked-but-undated, which is a defect worth showing. */
  appointmentAt: string | null;
  stage: MaStage;
  /** What the agent valued it at. Null until the visit produces a figure. */
  valuation: number | null;
  /** Presentation token, once one has been minted. */
  presentToken: string | null;
  createdAt: string;
}

/**
 * The stage as it actually is, not as it was last written.
 *
 * A stored stage goes stale the moment an appointment passes. Deriving it on
 * read means "awaiting valuation" appears on its own, with nothing to run and
 * nothing to forget. `won` and `lost` are terminal and never re-derived.
 */
export function effectiveStage(ma: MarketAppraisal, now = new Date()): MaStage {
  if (ma.stage === "won" || ma.stage === "lost") return ma.stage;
  // A recorded figure means the visit produced something, so the record has
  // moved past the appraisal whatever anyone remembered to click.
  if (ma.valuation != null && (ma.stage === "appraisal" || ma.stage === "booked")) {
    return "post_appraisal";
  }
  return ma.stage;
}

/**
 * The visit has been and gone and nobody wrote a figure down.
 *
 * This USED to be its own stage. It is better as a flag: as a stage it forced
 * a record out of "Appraisal" into a box of its own, which made the spine
 * longer to say something that is really an exception on a stage the record is
 * already sitting in. As a flag it can shout from wherever the file actually
 * is — and it is still derived, so nothing has to remember to set it.
 */
export function needsValuation(ma: MarketAppraisal, now = new Date()): boolean {
  if (ma.stage === "won" || ma.stage === "lost") return false;
  if (ma.valuation != null) return false;
  return Boolean(ma.appointmentAt && new Date(ma.appointmentAt) < now);
}

/** Open work, worst first: overdue valuations, then soonest appointment. */
export function urgencyOf(ma: MarketAppraisal, now = new Date()): number {
  if (needsValuation(ma, now)) return 0; // a forgotten valuation is the worst thing here
  if (!ma.appointmentAt) return 1; // booked with no date — a real defect
  return 2 + new Date(ma.appointmentAt).getTime() / 1e13;
}

export function handoverTarget(appraisalId: string): string {
  return `/market-appraisals?open=${encodeURIComponent(appraisalId)}&stage=pre_appraisal`;
}


/* REAL addresses from the live REX book, deliberately.
   Invented ones ("18 Ashworth Rise") produce an empty research panel and a
   Homesearch mis-match, which demos the feature as broken when it isn't. The
   landlord names are still stand-ins — the point is that the comparables and
   the guide underneath are genuine. */
export const SAMPLE_APPRAISALS: MarketAppraisal[] = [
  { id: "ma1", leadId: "l-carol", landlord: "Carol Whitfield", address: "11 Station Road", postcode: "L34 5SN", agent: "Kayleigh Wright", appointmentAt: "2026-08-25T14:00:00+01:00", stage: "booked", valuation: null, presentToken: null, createdAt: "2026-08-21" },
  { id: "ma2", leadId: null, landlord: "Peter Nsofor", address: "4 Hermosa Road", postcode: "TQ14 9LA", agent: "Rhiannon Dodge", appointmentAt: "2026-08-20T11:00:00+01:00", stage: "appraisal", valuation: null, presentToken: null, createdAt: "2026-08-14" },
  { id: "ma3", leadId: null, landlord: "Yvonne Clarke", address: "1 Worlds End Close", postcode: "B32 1JX", agent: "Rhiannon Dodge", appointmentAt: "2026-08-18T16:30:00+01:00", stage: "post_appraisal", valuation: 1450, presentToken: "sample", createdAt: "2026-08-11" },
  /**
   * THE TEST RECORD — James's, chosen because he used to rent on this street
   * and can therefore judge whether what we pull back is actually true. Every
   * other sample row can only be checked for plausibility; this one can be
   * checked for accuracy, which is a different and much more useful thing.
   *
   * Dictated as "NN54 WJ". The real postcode is **NN5 4WJ** (Northampton,
   * West Northamptonshire) — Homesearch 422s on the unspaced form and 200s on
   * the spaced one, so the space is load-bearing, not cosmetic.
   *
   * Verified live before seeding, rather than hoped for:
   *   26 addresses on the close · 12 Dover Close matches hs_id 18580372
   *   Detached House · 3 bed · 94 sqm · Band D · Freehold · EPC B · 2009-2016
   *   24 on the market in NN5 4, ALL 24 carrying photographs
   *
   * Sat at `booked` with the appointment ahead of it so the whole sequence —
   * pre-appraisal deck, visit, valuation, terms — can be driven from the top.
   *
   * If 12 is the wrong number, change it here: every other house on the close
   * resolves too, so the record moves with one edit.
   */
  { id: "ma4", leadId: null, landlord: "James Rowe", address: "12 Dover Close", postcode: "NN5 4WJ", agent: "Rhiannon Dodge", appointmentAt: "2026-08-31T10:30:00+01:00", stage: "booked", valuation: null, presentToken: null, createdAt: "2026-08-27" },
];
