/**
 * The market appraisal, as its own small pipeline.
 *
 * On the landlord track "Appraisal" is one dot, and that dot hides most of the
 * work. Between booking a visit and signing terms there is a confirmation to
 * send, a visit to do, a valuation to write up and a follow-up to make — and
 * then the part good agents actually win on, which is what happens to the ones
 * that DON'T say yes on the day.
 *
 * So: four steps and three endings. The steps run in order and the endings
 * don't — a case leaves the run at whatever point it ends, and nurture is a
 * place to live rather than a failure.
 *
 * Shaped against the F&C pipeline's own MarketAppraisalCase, which runs
 * upcoming → awaiting_valuation → nurture | won | lost. Same spine, more steps
 * before the visit, because that is where the confirmation and the pack go.
 */

export type AppraisalStage = "booked" | "pre" | "visit" | "post";
export type AppraisalOutcome = "won" | "nurture" | "lost";
export type AppraisalState = AppraisalStage | AppraisalOutcome;

export type AppraisalStep = {
  id: AppraisalStage;
  label: string;
  title: string;
  detail: string;
  /** The one thing that moves it on. */
  cta: string;
  icon: string;
};

export const APPRAISAL_STEPS: AppraisalStep[] = [
  {
    id: "booked",
    label: "Booked",
    icon: "calendar",
    title: "Appraisal booked",
    detail:
      "It's in the diary. Nothing has gone out to them yet — they know the time because you said it on the phone, which is not the same as them having it in writing. Put it in writing while the call is still warm, and put it in their calendar.",
    cta: "Confirm it with them",
  },
  {
    id: "pre",
    label: "Pre-appraisal",
    icon: "mail",
    title: "Before the visit",
    detail:
      "What to expect on the day — who's coming, how long it takes, what to have to hand, and their own page with your face on it. Best sent the day before rather than now - close enough that it is still in mind when you knock.",
    cta: "Send the pre-appraisal",
  },
  {
    id: "visit",
    label: "Appraisal",
    icon: "home",
    title: "The appraisal",
    detail:
      "Walk the property, talk about the rent, and land on the number together. Nothing to fill in here until you're out — the form is the next step, not this one.",
    cta: "Mark it as done",
  },
  {
    id: "post",
    label: "Post-appraisal",
    icon: "checklist",
    title: "After the visit",
    detail:
      "The figure you gave them, the fee you quoted, what they said and what they were weighing up. Then the follow-up — the call after the visit is where instructions are actually won.",
    cta: "Write it up",
  },
];

export const OUTCOMES: {
  id: AppraisalOutcome;
  label: string;
  detail: string;
  icon: string;
}[] = [
  {
    id: "won",
    label: "Won",
    icon: "star",
    detail: "They're instructing. The record carries on to terms of business.",
  },
  {
    id: "nurture",
    label: "Nurture",
    icon: "clock",
    detail:
      "Not ready — selling next spring, waiting on a tenant to leave, thinking about it. Keep it warm and come back on a date.",
  },
  {
    id: "lost",
    label: "Lost",
    icon: "cross",
    detail:
      "Gone elsewhere, or not proceeding. Worth recording why: a lost reason is what a win-back campaign is built on.",
  },
];

/** Susan's team's own words for why one goes. Kept short — a long list gets
 *  one answer picked out of laziness and tells you nothing. */
export const LOST_REASONS = [
  "Went with another agent",
  "Fee too high",
  "Valuation too low",
  "Decided to sell instead",
  "Decided not to let",
  "Went direct / self-managing",
  "Lost touch",
  "Other",
] as const;

export const NURTURE_REASONS = [
  "Tenant still in situ",
  "Letting later in the year",
  "Refurbishing first",
  "Weighing up agents",
  "Thinking about it",
  "Other",
] as const;

/** One contact with the landlord, in either direction. */
export type Touch = {
  id: string;
  at: string;
  kind: "call" | "email" | "text" | "visit" | "note";
  who: string;
  what: string;
};

/** A file taken at the visit, or sent over afterwards. */
export type AppraisalDoc = {
  id: string;
  name: string;
  url: string;
  at: string;
};

export type AppraisalCase = {
  state: AppraisalState;
  /** When the visit is, as text — the diary holds the real event. */
  bookedFor: string | null;
  /**
   * The same moment as an instant, and how long it runs.
   *
   * `bookedFor` alone is not enough: the landlord's calendar file and their
   * pre-appraisal page both need a real start and a real length, and with
   * only the text label the .ics could never be generated and the page fell
   * back to a hard-coded three quarters of an hour. Null means nothing has
   * been booked through the OS — an older record, or one booked by phone.
   */
  bookedAt: string | null;
  bookedMinutes: number | null;
  confirmationSentAt: string | null;
  /** When the .ics was taken. Only so the step can stop nagging about it. */
  inviteSavedAt: string | null;
  /**
   * The pre-appraisal, queued rather than sent.
   *
   * It is the one email in the run that is BETTER late: the day before, when
   * the visit is close enough to still be in mind when the agent knocks. So
   * the step offers to schedule it, and this is the date it goes.
   * See PRE_APPRAISAL_LEAD_DAYS in lib/appraisal-email.
   */
  preScheduledFor: string | null;
  preScheduleId: string | null;
  /**
   * @deprecated READ-ONLY FALLBACK. The valuation lives on the appraisal record
   * (os_market_appraisals.valuation), not here.
   *
   * There were two of these and they never spoke: a figure typed into the lead
   * drawer landed in os_case_state, while the appraisal file and the
   * post-appraisal deck read os_market_appraisals — so the same property could
   * show 1,300 on one screen and "No figure yet" on the other.
   *
   * AppraisalTrack now reads and writes the appraisal record directly and only
   * falls back to these when it holds nothing, so rows written before 31 Aug
   * 2026 still display. NOTHING SHOULD WRITE THEM. Adding a writer back
   * recreates the split.
   */
  valuation: number | null;
  /** @deprecated Read-only fallback — see valuation above. Now fee_pct on the
   *  appraisal record. */
  feePercent: number | null;
  /**
   * What the landlord wants for it, which is a different number from the
   * valuation and the gap between the two is the whole conversation.
   */
  askingRent: number | null;
  /* The property, filled in at the visit — this is the one moment someone is
     actually standing in it, and the lead record rarely knows any of this. */
  bedrooms: number | null;
  bathrooms: number | null;
  receptions: number | null;
  availableFrom: string | null;
  /** Vacant, tenanted, notice served — in their words. */
  tenantSituation: string;
  /** Condition, works needed, anything seen on the day. */
  condition: string;
  docs: AppraisalDoc[];
  summary: string;
  /** The next time someone has agreed to make contact. */
  nextActionAt: string | null;
  outcomeReason: string | null;
  outcomeNotes: string;
  /** The campaign they were put on when it ended. Marketing wrote it; the
   *  agent only picked it. */
  campaignId: string | null;
  decidedAt: string | null;
  touches: Touch[];
};

export const EMPTY_CASE: AppraisalCase = {
  state: "booked",
  bookedFor: null,
  bookedAt: null,
  bookedMinutes: null,
  confirmationSentAt: null,
  inviteSavedAt: null,
  preScheduledFor: null,
  preScheduleId: null,
  valuation: null,
  feePercent: null,
  askingRent: null,
  bedrooms: null,
  bathrooms: null,
  receptions: null,
  availableFrom: null,
  tenantSituation: "",
  condition: "",
  docs: [],
  summary: "",
  nextActionAt: null,
  outcomeReason: null,
  outcomeNotes: "",
  campaignId: null,
  decidedAt: null,
  touches: [],
};

export function isOutcome(s: AppraisalState): s is AppraisalOutcome {
  return s === "won" || s === "nurture" || s === "lost";
}

/** How far along the four steps, for the rail. Outcomes sit past the end. */
export function stageIndex(s: AppraisalState): number {
  if (isOutcome(s)) return APPRAISAL_STEPS.length;
  return APPRAISAL_STEPS.findIndex((x) => x.id === s);
}

/**
 * A case nobody has touched. Nurture is the point of the whole exercise, so
 * this is what makes it a system rather than a list: a follow-up date that has
 * been and gone, or a nurture case with no date at all.
 */
export function needsAttention(c: AppraisalCase, now = new Date()): string | null {
  if (c.state === "won" || c.state === "lost") return null;
  if (c.state === "nurture" && !c.nextActionAt) return "In nurture with no follow-up date set";
  if (c.nextActionAt && new Date(c.nextActionAt) < now) {
    const days = Math.floor((now.valueOf() - new Date(c.nextActionAt).valueOf()) / 86_400_000);
    return days < 1 ? "Follow-up due today" : `Follow-up ${days} day${days === 1 ? "" : "s"} overdue`;
  }
  if (c.state === "post" && !c.summary.trim()) return "Visit done, nothing written up yet";
  return null;
}
