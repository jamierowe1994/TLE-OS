import type { Campaign, CampaignStep } from "./campaigns";

/**
 * When a campaign's next step is due.
 *
 * Pure, and deliberately so: the whole of the scheduler's judgement lives in
 * this file, where it can be reasoned about without a database, a clock or a
 * mail server. The route around it only does the writing.
 *
 * Two rules carry all the weight.
 *
 * ONE STEP PER RUN. If nothing runs for a fortnight, three steps come due at
 * once. Firing all three would land in a landlord's inbox as three emails in a
 * minute, which is how a nurture sequence turns into spam.
 *
 * THE LATEST DUE STEP WINS. Not the oldest. A "good luck with the let" note
 * that arrives forty days after they went elsewhere is worse than one that
 * never arrives — it says nobody was paying attention. So the overdue early
 * steps are recorded as OVERTAKEN and skipped, and the one that actually
 * suits today goes out.
 */

export type StepPlan = {
  /** Index into the campaign's steps, sorted by day. The enrolment's
   *  last_step_sent counts in this same order. */
  index: number;
  step: CampaignStep;
  /** Days since enrolment, whole days. */
  elapsed: number;
  /** How late this step is, in days. 0 = due today. */
  overdue: number;
  /** Earlier steps skipped because this one has overtaken them. */
  overtaken: { index: number; step: CampaignStep }[];
};

const DAY = 86_400_000;

/** Steps in the order the scheduler counts them. Authored ascending already;
 *  sorted anyway so a mis-ordered edit can't shuffle everyone's position. */
export function orderedSteps(c: Campaign): CampaignStep[] {
  return [...c.steps].sort((a, b) => a.day - b.day);
}

export function elapsedDays(enrolledAt: string | Date, now: Date = new Date()): number {
  const from = enrolledAt instanceof Date ? enrolledAt : new Date(enrolledAt);
  return Math.floor((now.valueOf() - from.valueOf()) / DAY);
}

/**
 * What to do for one enrolment right now, or null for nothing.
 *
 * `lastStepSent` is the index of the last step accounted for — sent, handed to
 * a human, or overtaken. -1 means none. A step is never revisited: this only
 * ever looks forward.
 */
export function nextDue(
  campaign: Campaign,
  enrolledAt: string | Date,
  lastStepSent: number,
  now: Date = new Date()
): StepPlan | null {
  const steps = orderedSteps(campaign);
  const elapsed = elapsedDays(enrolledAt, now);

  const due: number[] = [];
  for (let i = lastStepSent + 1; i < steps.length; i++) {
    if (steps[i].day <= elapsed) due.push(i);
  }
  if (!due.length) return null;

  const index = due[due.length - 1];
  return {
    index,
    step: steps[index],
    elapsed,
    overdue: elapsed - steps[index].day,
    overtaken: due.slice(0, -1).map((i) => ({ index: i, step: steps[i] })),
  };
}

/** Has this enrolment reached the end of the campaign? */
export function finished(campaign: Campaign, lastStepSent: number): boolean {
  return lastStepSent >= campaign.steps.length - 1;
}

/**
 * What happens when a due step comes up. Only an email can be sent by a
 * machine; the rest are honest about needing a person.
 *
 *   send      — an email with copy behind it
 *   unwritten — an email step marketing hasn't written yet. NOT an error, and
 *               not skipped either: it holds the sequence where it is until
 *               someone writes it, because sending nothing is better than
 *               sending the agent-facing shorthand to a landlord.
 *   human     — a call or a letter. Logged as a job for the office and stepped
 *               past, so one phone call can't stall a campaign forever.
 */
export type Disposition = "send" | "unwritten" | "human";

/**
 * `written` is copy saved in the editor. It counts the same as copy in code —
 * a step is written or it isn't, and where the words happen to live is not
 * something the scheduler should have an opinion about.
 */
export function dispositionOf(step: CampaignStep, written = false): Disposition {
  if (step.channel !== "email") return "human";
  return written || step.body?.length ? "send" : "unwritten";
}
