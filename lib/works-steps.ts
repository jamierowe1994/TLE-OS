/**
 * The maintenance workflow's steps and which one a job is on. Pure, no
 * database, so the job sheet draws the same "Now" card the server reasons
 * with (James and Michael, 7 Sep 2026: "one thing at a time").
 */
export type StepOrder = {
  status: string; kind: string; landlordToldAt: string | null; arranging: "landlord" | "us" | null; landlordResolvedAt: string | null;
  contractorId: string | null; contractorConfirmedAt: string | null; scheduledAt: string | null; completedAt: string | null; tenantHappy: "yes" | "no" | null; payee: "contractor" | "agent" | null;
  landlordSkipped?: boolean;
  /** Steps the agent chose to skip for now (Howard, 15 Oct 2026). Only SKIPPABLE ones, and never a faked fact. */
  skippedSteps?: string[];
  /** Asked for a quote first (Sean, 20 Oct 2026); the quote and its approval come before anything else. */
  quoteRequestedAt?: string | null;
  quotePence?: number | null;
};

export const STEPS = [
  { id: "quote", label: "The quote", blurb: "The contractor has been asked for a price. Nothing is booked and no works order goes until the quote is approved." },
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

/**
 * Required or optional, for the Now card (Howard, 15 Oct 2026: "agents will
 * still bypass the system, so unless absolutely required, give them the
 * option to skip steps but ensure any required information is requested").
 * Only two steps can be skipped. Contractor confirmed stays required: it is
 * what sends the contractor the works order and their page.
 */
export const SKIPPABLE = ["tell_landlord", "aftercare"] as const;
export type SkippableStep = (typeof SKIPPABLE)[number];
export const isSkippable = (id: string): id is SkippableStep => (SKIPPABLE as readonly string[]).includes(id);

export const WHY_REQUIRED: Partial<Record<StepId, string>> = {
  /* Sean McMahon, 20 Oct 2026. */
  quote: "The landlord approves the price before any works order goes.",
  arranging: "It decides whether it's the landlord's people or ours.",
  landlord_follow_up: "It's the landlord's job now, and it stays open until it's resolved.",
  pick_contractor: "Nothing after this works without somebody on the job.",
  contractor_confirm: "Confirming is what sends the contractor the works order and their page, and tells the tenant somebody's coming.",
  booking: "The contractor needs it to turn up, and the tenant to give access.",
  visit: "Say what was done, so the job can move on to the money and compliance hear it's finished.",
  payment: "Accounts need to know who to pay.",
  invoice: "The amount is what accounts pay and the landlord is invoiced for.",
};

export const WHY_OPTIONAL: Partial<Record<SkippableStep, string>> = {
  tell_landlord: "Skip it if you couldn't reach them or they've said to just get on with it. They still hear when the date is set.",
  aftercare: "Skip it if you can't get an answer. If they reply to the email later, it still lands on the job.",
};

/** "Skipped: Is the tenant happy?" - a label that asks a question takes no full stop after it. */
export const skippedLine = (id: StepId) => {
  const label = STEPS.find((x) => x.id === id)?.label ?? id;
  return `Skipped for now: ${label}${label.endsWith("?") ? "" : "."}`;
};

export const wasSkipped = (o: Pick<StepOrder, "skippedSteps">, id: StepId) => (o.skippedSteps ?? []).includes(id);

export function stepOf(o: StepOrder): StepId {
  if (o.status === "cancelled") return "closed";
  if (o.status === "paid") return "closed";
  /* Planned maintenance raised since 8 Oct 2026 is ours to arrange from the
     start (arranging "us"), so it goes straight to the contractor: no landlord
     to ring about a gas safety (James). Older planned jobs walk the old line.
     A repair sent to the contractor as it was raised is ours too (9 Oct 2026),
     but the landlord still hears about a repair - unless they were skipped. */
  /* Work already done - logged off a contractor's invoice, or done before
     the OS was around (Rhiannon, 19 Oct 2026) - has no landlord to tell and
     no visit to arrange. It goes straight to what is left after a visit. */
  if (o.completedAt && o.arranging !== "landlord") {
    if (o.kind === "repair" && !o.tenantHappy && !wasSkipped(o, "aftercare")) return "aftercare";
    if (!o.payee) return "payment";
    return "invoice";
  }
  /* Quote first (Sean, 20 Oct 2026): waiting on the contractor's price, or
     on the landlord's yes to it. Once approved, the job walks on as usual. */
  if (o.quoteRequestedAt && (o.quotePence == null || o.status === "approval")) return "quote";
  const ours = o.arranging === "us" && (o.kind === "planned" || o.landlordSkipped === true);
  if (!o.landlordToldAt && !ours && !wasSkipped(o, "tell_landlord")) return "tell_landlord";
  if (!o.arranging) return "arranging";
  if (o.arranging === "landlord") return o.landlordResolvedAt ? "closed" : "landlord_follow_up";
  if (!o.contractorId) return "pick_contractor";
  if (!o.contractorConfirmedAt) return "contractor_confirm";
  if (!o.scheduledAt) return "booking";
  if (!o.completedAt) return "visit";
  /* A skipped step is passed over, never filled in: landlordToldAt and
     tenantHappy stay empty, so doing it later still records the real thing. */
  if (o.kind === "repair" && !o.tenantHappy && !wasSkipped(o, "aftercare")) return "aftercare";
  if (!o.payee) return "payment";
  return "invoice";
}

