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
  /**
   * How to reach the landlord. DERIVED from the contact record, never stored —
   * the same rule as the address, and for the same reason: a copy goes stale
   * the first time somebody corrects a number in Leads.
   *
   * Null means no contact record behind this appraisal; empty is impossible,
   * because a contact holding no email yields null too. Both render as "not
   * recorded" rather than as a blank that looks like a loading state.
   */
  landlordEmail?: string | null;
  landlordMobile?: string | null;
  /** ISO. Null means booked-but-undated, which is a defect worth showing. */
  appointmentAt: string | null;
  stage: MaStage;
  /** What the agent valued it at, £ pcm. Null until the visit produces one. */
  valuation: number | null;
  /**
   * WHAT WAS AGREED, not just what it is worth.
   *
   * The valuation on its own cannot build a post-appraisal deck. That deck's
   * whole job is to put the offer in writing — the rent, what we will do for
   * it, and what it costs — so the terms are recorded beside the figure rather
   * than left in an agent's head between the visit and the paperwork.
   *
   * All optional: an agent standing in a hallway may know the rent and not yet
   * the service level, and a form that refuses a figure until every box is
   * filled is a form that gets skipped.
   */
  serviceLevel: ServiceLevel | null;
  /** Management fee, percent of rent. */
  feePct: number | null;
  /** Tenancy set-up fee, £. */
  setupFee: number | null;
  /** Anything the figure needs explaining by — conditions, a range, a caveat. */
  valuationNote: string | null;
  /** ISO, and who. A figure with no author cannot be questioned later. */
  valuedAt: string | null;
  valuedBy: string | null;
  /**
   * The REX property, chosen by an agent rather than matched by us.
   *
   * Null until somebody picks it. Signing the terms cannot create a REX
   * listing without it, and that gate is deliberate — see the note on the
   * column in lib/db.
   */
  rexPropertyId: string | null;
  /** Presentation token, once one has been minted. */
  presentToken: string | null;
  createdAt: string;
}

/**
 * PROPOLY'S VOCABULARY, not one of our own.
 *
 * Propoly is the source of truth for deals and it stores exactly these three
 * (`full_managed` / `tenant_find` / `rent_collect`, see lib/business/propoly-deals).
 * Inventing a fourth here, or renaming one, would mean a translation layer the
 * day an appraisal becomes a deal — and translation layers are where service
 * levels go to get mismatched.
 *
 * Rent protection is deliberately NOT here: it is a tag on a deal, not a
 * service level, and it has been mistaken for one before.
 */
export type ServiceLevel = "full_managed" | "tenant_find" | "rent_collect";

export const SERVICE_LEVELS: { id: ServiceLevel; label: string }[] = [
  { id: "full_managed", label: "Fully managed" },
  { id: "tenant_find", label: "Tenant find" },
  { id: "rent_collect", label: "Rent collect" },
];

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


/* NO SAMPLE APPRAISALS. James, 30 Aug: "remove that seed data and add in the
   actual world data."

   Four hardcoded records used to be merged into every appraisal screen and
   badged as stand-ins. Honest, but they were also the only reason those pages
   ever had anything on them, which meant the real store could stay empty
   without anybody noticing — and it did: the capture job's first seeder asked
   os_market_appraisals for postcodes and got none, because every appraisal on
   screen was a literal in this file.

   Every screen now reads /api/appraisals, and an empty list renders as empty.
   See the project rule: if a source has nothing, say so; never draw something
   that looks live and is not. */

