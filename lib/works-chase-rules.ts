import { stepOf, type StepOrder } from "@/lib/works-steps";

/**
 * Chasing a contractor who hasn't come back: the shape and the rules, with
 * no database, so the job page and the server judge "is this one waiting on
 * the contractor?" the same way. The sending and the timer are lib/works-chase.
 *
 * Sean McMahon, 26 Oct 2026: "If I request a certificate to be done from a
 * contractor, and then a week later I still haven't heard back ... is there
 * any way I can just touch a button and remind that contractor, in a polite
 * way? ... a reminder, then a final reminder, and on the final reminder it
 * basically says, 'Unless you come back to us within the next 48 hours, we
 * have to cancel this job'."
 */

export type ChaseNext = "reminder" | "final" | "silent";

export interface WorksChase {
  contractorId: string;
  contractorName: string;
  /** Days to the first reminder, then from it to the final. Null when only sent by hand. */
  firstDays: number | null;
  finalDays: number | null;
  setAt: string;
  setBy: string;
  /** What happens next, and when. "silent" is the 48 hours after the final running out. */
  nextKind: ChaseNext | null;
  nextAt: string | null;
  remindedAt: string | null;
  finalAt: string | null;
  /** 48 hours after the final with no word: in front of the agent, never cancelled on its own. */
  silentAt: string | null;
  stoppedAt: string | null;
  stoppedWhy: string;
}

/** The defaults Sean and James talked through: a week, then three days. */
export const CHASE_FIRST_DAYS = 7;
export const CHASE_FINAL_DAYS = 3;
/** How long the final reminder gives them. Said in the email, so the same number everywhere. */
export const CHASE_GRACE_HOURS = 48;

type Chaseable = StepOrder & {
  contractorName: string;
  contractorContactedAt: string | null;
  orderSentTo: string | null;
  invoicePence: number | null;
};

/**
 * Why this job can't be chased now, or null when it is with a contractor and
 * waiting on them: the works order has gone, and there's no date yet, or the
 * date has been and nothing came back (done, a certificate, an invoice).
 */
export function chaseBlock(o: Chaseable, now = Date.now()): string | null {
  if (o.status === "approval") return "Waiting on the landlord, not the contractor";
  if (!["reported", "approved", "scheduled"].includes(o.status)) return "Only on an open job";
  if (!o.contractorId) return "No contractor on the job";
  if (stepOf(o) === "quote") return "Out for quotes - send the request again instead";
  if (o.orderSentTo && o.orderSentTo !== o.contractorId) return `${o.contractorName || "They"} haven't had the works order yet`;
  if (!(o.orderSentTo || o.contractorConfirmedAt || o.contractorContactedAt)) return "The works order hasn't gone yet";
  if (o.completedAt) return "Marked done";
  if (o.invoicePence != null) return "Their invoice is in";
  if (o.scheduledAt && new Date(o.scheduledAt).getTime() > now) return "They've given a date";
  return null;
}

/** A chase still running. */
export const chaseLive = (c: WorksChase | null | undefined): c is WorksChase => !!c && !c.stoppedAt;
