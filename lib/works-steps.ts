/**
 * The maintenance workflow's steps and which one a job is on. Pure, no
 * database, so the job sheet draws the same "Now" card the server reasons
 * with (James and Michael, 7 Sep 2026: "one thing at a time").
 */
export type StepOrder = {
  status: string; kind: string; landlordToldAt: string | null; arranging: "landlord" | "us" | null; landlordResolvedAt: string | null;
  contractorId: string | null; contractorConfirmedAt: string | null; scheduledAt: string | null; completedAt: string | null; tenantHappy: "yes" | "no" | null; payee: "contractor" | "agent" | null;
};

export const STEPS = [
  { id: "tell_landlord", label: "Tell the landlord", blurb: "Ring them first. Email the report if you can't get them, or to put it in writing." },
  { id: "arranging", label: "Who's arranging it?", blurb: "The landlord with their own people, or us." },
  { id: "landlord_follow_up", label: "Landlord organising", blurb: "Their contractor, their timescale. Chase on the follow-up date until it's resolved." },
  { id: "pick_contractor", label: "Pick a contractor", blurb: "Your book and the company's, matched to the trade and sorted by distance." },
  { id: "contractor_confirm", label: "Contractor confirmed?", blurb: "Once they say yes, the works order and the tenant's email go out together." },
  { id: "booking", label: "The date", blurb: "The contractor books it with the tenant and sets it on their page, or you type it in." },
  { id: "visit", label: "The visit", blurb: "Mark it done when it is. The contractor can do that from their page, with photos and the invoice." },
  { id: "aftercare", label: "Is the tenant happy?", blurb: "They get one email with a yes and a no. A no comes back to you." },
  { id: "payment", label: "Who's being paid?", blurb: "The contractor, or the agent who paid out of their own pocket." },
  { id: "invoice", label: "The money", blurb: "The contractor's invoice on the job, the landlord invoiced, the bill on the accounts list." },
  { id: "closed", label: "Closed", blurb: "" },
] as const;
export type StepId = (typeof STEPS)[number]["id"];

export function stepOf(o: StepOrder): StepId {
  if (o.status === "cancelled") return "closed";
  if (o.status === "paid") return "closed";
  if (!o.landlordToldAt) return "tell_landlord";
  if (!o.arranging) return "arranging";
  if (o.arranging === "landlord") return o.landlordResolvedAt ? "closed" : "landlord_follow_up";
  if (!o.contractorId) return "pick_contractor";
  if (!o.contractorConfirmedAt) return "contractor_confirm";
  if (!o.scheduledAt) return "booking";
  if (!o.completedAt) return "visit";
  if (o.kind === "repair" && !o.tenantHappy) return "aftercare";
  if (!o.payee) return "payment";
  return "invoice";
}

