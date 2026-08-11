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
      "It's in the diary. Nothing has gone out to them yet — they know the time because you said it on the phone, which is not the same as them having it in writing.",
    cta: "Confirm it with them",
  },
  {
    id: "pre",
    label: "Pre-appraisal",
    icon: "mail",
    title: "Before the visit",
    detail:
      "The confirmation, the calendar invite, and what to expect on the day — who's coming, how long it takes, what to have to hand. This is the part that stops the no-shows and the ones who forgot they'd booked.",
    cta: "Send the confirmation",
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

export type AppraisalCase = {
  state: AppraisalState;
  /** When the visit is, as text — the diary holds the real event. */
  bookedFor: string | null;
  confirmationSentAt: string | null;
  /** What it was valued at, per calendar month. */
  valuation: number | null;
  feePercent: number | null;
  summary: string;
  /** The next time someone has agreed to make contact. */
  nextActionAt: string | null;
  outcomeReason: string | null;
  outcomeNotes: string;
  decidedAt: string | null;
  touches: Touch[];
};

export const EMPTY_CASE: AppraisalCase = {
  state: "booked",
  bookedFor: null,
  confirmationSentAt: null,
  valuation: null,
  feePercent: null,
  summary: "",
  nextActionAt: null,
  outcomeReason: null,
  outcomeNotes: "",
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
