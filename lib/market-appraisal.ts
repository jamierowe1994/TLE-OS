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

export type MaStage =
  | "booked"
  | "pre_appraisal"
  | "appraisal"
  | "awaiting_valuation"
  | "post_appraisal"
  | "terms"
  | "takeon"
  | "id_ownership"
  | "aml"
  | "won"
  | "lost";

export const MA_STAGES: { id: MaStage; label: string; blurb: string }[] = [
  { id: "booked", label: "Booked", blurb: "In the diary, confirmation sent." },
  { id: "pre_appraisal", label: "Pre-appraisal", blurb: "Research, comparables and the deck the landlord opens before you arrive." },
  { id: "appraisal", label: "Appraisal", blurb: "The visit itself — the presentation you show on the day." },
  { id: "awaiting_valuation", label: "Awaiting valuation", blurb: "Visit done, no figure recorded yet." },
  { id: "post_appraisal", label: "Post-appraisal", blurb: "Figure agreed, deck sent, follow-up set." },
  /* Everything below moved off the LEAD spine on 23 Aug. It all happens after
     a visit is booked, so it belongs to the appraisal, not to the lead. This
     is the long part, and that is accepted rather than fought — the answer is
     smaller ticks, not fewer stages. */
  { id: "terms", label: "Terms", blurb: "Out for signature with the fee and service level." },
  { id: "takeon", label: "Take-on & photos", blurb: "The visit that produces the photographs, the description and the front image." },
  { id: "id_ownership", label: "ID & ownership", blurb: "Photo ID, and proof they actually own it." },
  { id: "aml", label: "AML & compliance", blurb: "Due diligence on the landlord, and the property's certificates." },
  { id: "won", label: "Won", blurb: "Everything clear. It becomes a listing." },
  { id: "lost", label: "Lost", blurb: "Instructed elsewhere, or not proceeding." },
];

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
  if (ma.valuation != null) {
    return ma.stage === "post_appraisal" ? "post_appraisal" : "post_appraisal";
  }
  if (ma.appointmentAt && new Date(ma.appointmentAt) < now) return "awaiting_valuation";
  return ma.stage;
}

/** Open work, worst first: overdue valuations, then soonest appointment. */
export function urgencyOf(ma: MarketAppraisal, now = new Date()): number {
  const s = effectiveStage(ma, now);
  if (s === "awaiting_valuation") return 0;
  if (!ma.appointmentAt) return 1; // booked with no date — a real defect
  return 2 + new Date(ma.appointmentAt).getTime() / 1e13;
}

/**
 * Where a lead goes when its appraisal is booked.
 *
 * James, 23 Aug: booking should CLOSE the lead drawer and reopen the record on
 * Market Appraisals at the next stage — not quietly leave the agent on the
 * Leads page wondering what changed. The lead is not deleted; it is handed on,
 * and `leadId` above keeps the thread.
 */
export function handoverTarget(appraisalId: string): string {
  return `/market-appraisals?open=${encodeURIComponent(appraisalId)}&stage=pre_appraisal`;
}
