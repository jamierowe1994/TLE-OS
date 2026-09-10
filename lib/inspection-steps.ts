/**
 * The inspection workflow's steps, and which one a visit is on.
 *
 * Pure and client-safe, exactly like lib/works-steps.ts, so the sheet draws
 * the same "Now" card the server reasons with. One thing at a time: an
 * inspection has more waiting in it than a repair does - the tenant has to
 * answer before anything can be booked - and the step is what stops that
 * waiting from looking like nothing happening.
 */

export type StepInspection = {
  status: string;
  accessMethod: string;
  accessAskedAt: string | null;
  accessReply: "yes" | "no" | "other_time" | null;
  bookedAt: string | null;
  tenantConfirmedAt: string | null;
  visitedAt: string | null;
  noAccessAt: string | null;
  reportedAt: string | null;
  reportSentAt: string | null;
  /** Findings that asked for work and have no works order on them yet. */
  openActions: number;
};

export const STEPS = [
  { id: "ask_access", label: "Ask the tenant", blurb: "Their home. Offer dates, give the notice the tenancy requires, and let them answer in writing." },
  { id: "await_access", label: "Waiting on the tenant", blurb: "Asked, not answered. Chase by phone once the notice period is over halfway gone." },
  { id: "rearrange", label: "Find another time", blurb: "They said no or asked for a different time. Offer fresh dates - never just turn up." },
  { id: "book", label: "Book the visit", blurb: "Permission given. Put the date in and tell the landlord it is happening." },
  { id: "confirm", label: "Confirm it", blurb: "Send the tenant the date in writing. That confirmation is the record of notice." },
  { id: "visit", label: "The visit", blurb: "Walk it room by room, photograph what matters, and mark it done - or record that you could not get in." },
  { id: "report", label: "Write it up", blurb: "The overall condition, what you found, and who has to put each thing right." },
  { id: "send_report", label: "Send it to the landlord", blurb: "Their home, their report. It goes out with the photos on it." },
  { id: "actions", label: "Raise the actions", blurb: "Anything for us or the landlord to fix becomes a works order from here." },
  { id: "closed", label: "Closed", blurb: "" },
] as const;
export type StepId = (typeof STEPS)[number]["id"];

export function stepOf(i: StepInspection): StepId {
  if (i.status === "cancelled" || i.status === "closed") return "closed";
  /* Nobody in, or turned away at the door. That is not a failed inspection,
     it is an inspection that has to be arranged again - so it goes back to
     the top of the loop rather than sitting in "visit" forever. */
  if (i.noAccessAt && !i.visitedAt) return "rearrange";
  if (i.accessReply === "no" || i.accessReply === "other_time") return "rearrange";
  /* Keys held and the tenancy allows it: the ask is still made, because
     notice is owed either way, but the answer is not what unblocks it. */
  if (!i.accessAskedAt) return "ask_access";
  if (!i.accessReply && !i.bookedAt) return "await_access";
  if (!i.bookedAt) return "book";
  if (!i.tenantConfirmedAt) return "confirm";
  if (!i.visitedAt) return "visit";
  if (!i.reportedAt) return "report";
  if (!i.reportSentAt) return "send_report";
  if (i.openActions > 0) return "actions";
  return "closed";
}

export const stepLabel = (id: StepId) => STEPS.find((s) => s.id === id)?.label ?? "";
