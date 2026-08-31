/**
 * Build the presentation — the wizard behind the appraisal deck.
 *
 * Modelled on Fine & Country's research flow, which James walked through on
 * 23 Aug, and converted from SALES to LETTINGS. Their six steps become five:
 * **buyer matches is dropped**, because a landlord does not care who is
 * looking, they care what it will let for and how fast.
 *
 * ── The sales → lettings conversions that actually matter ─────────────────
 *
 * **"Sold properties" becomes "Recently let".** The evidence a landlord wants
 * is not what a house down the road sold for, it is what one let for and how
 * many days it took. We already hold that — `letAgreed` and `daysOnMarket` on
 * our own book — which is why the comparables come from us rather than a feed.
 *
 * **£/sqft is dropped.** F&C lean on it heavily and it is the right measure
 * for sales. We do not hold reliable floor areas for rentals, and a £/sqft
 * computed from a missing or guessed area is a confident number built on
 * nothing. **£ per bedroom** is the honest lettings equivalent and we do hold
 * the inputs for it.
 *
 * **Days on market becomes the headline, not a footnote.** In sales it is a
 * warning sign; in lettings it is the product. "Let in nine days" is the
 * single most persuasive number an agent has.
 *
 * ── Two rules the step model enforces ─────────────────────────────────────
 *
 * 1. A STEP CAN BE EMPTY AND THE WIZARD STILL FINISHES. No local comparables
 *    is a real and common outcome, and a builder that traps an agent on step
 *    three because our book is thin in Birmingham is worse than one that lets
 *    them past with a section switched off.
 *
 * 2. NOTHING IS SELECTED BY DEFAULT THAT WE WOULD NOT DEFEND. Comparables
 *    start selected only where the sample is honest — see `defaultSelection`.
 *    A pre-ticked box is an implicit recommendation.
 */

export const BUILD_STEPS = [
  { id: "property", label: "Property", blurb: "What we know about it — beds, type, tenure, EPC." },
  { id: "available", label: "On the market", blurb: "What a tenant is choosing between right now." },
  { id: "let", label: "Recently let", blurb: "What actually let nearby, and how long it took." },
  { id: "market", label: "Market", blurb: "Rents, pace, size and competition. Tick what goes to the landlord." },
  { id: "review", label: "Review", blurb: "What goes in the presentation, and in what order." },
] as const;

export type BuildStepId = (typeof BUILD_STEPS)[number]["id"];

/* ── the sections a deck can carry ────────────────────────────────────────── */

export interface DeckSection {
  id: string;
  label: string;
  /** Some pages carry the brand and cannot be switched off. */
  always: boolean;
  /** Off by default when we cannot usually stand it up with real data. */
  onByDefault: boolean;
  blurb: string;
}

export const DECK_SECTIONS: DeckSection[] = [
  { id: "welcome", label: "Welcome", always: true, onByDefault: true, blurb: "The opening. Always included." },
  { id: "agent", label: "Your agent", always: false, onByDefault: true, blurb: "Who is coming, and how to reach them." },
  { id: "guide", label: "The rent guide", always: false, onByDefault: true, blurb: "The range, and what it rests on." },
  { id: "comparables", label: "What's letting nearby", always: false, onByDefault: true, blurb: "Named properties with rents and days to let." },
  /* Off by default, and it stays off by default now that it is real: the
     Market step's ticks are what turn it on, per appraisal. A section that
     appeared automatically would put the whole area picture in front of a
     landlord the agent had not yet chosen to show it to. */
  { id: "market", label: "The local market", always: false, onByDefault: false, blurb: "Pace, rent by size, mix and competition — whatever is ticked on the Market step." },
  { id: "service", label: "How we let it", always: false, onByDefault: true, blurb: "What we do, and what it costs." },
  { id: "compliance", label: "Getting it legal", always: false, onByDefault: true, blurb: "The certificates a let needs — the bit landlords underestimate." },
  { id: "next", label: "What happens next", always: true, onByDefault: true, blurb: "The close. Always included." },
];

export interface DeckPlan {
  /** Section ids, IN ORDER. Reordering is the agent's, within the rules. */
  order: string[];
  /** Which are switched on. `always` sections are ignored here. */
  enabled: Record<string, boolean>;
}

export function defaultPlan(): DeckPlan {
  return {
    order: DECK_SECTIONS.map((s) => s.id),
    enabled: Object.fromEntries(DECK_SECTIONS.map((s) => [s.id, s.always || s.onByDefault])),
  };
}

/**
 * The pages that will actually be produced.
 *
 * `always` wins over `enabled`, so a section that carries the brand cannot be
 * switched off by accident — and the UI shows it as fixed rather than as a
 * toggle that silently does nothing.
 */
export function pagesIn(plan: DeckPlan): DeckSection[] {
  const by = new Map(DECK_SECTIONS.map((s) => [s.id, s]));
  return plan.order
    .map((id) => by.get(id))
    .filter((s): s is DeckSection => Boolean(s))
    .filter((s) => s.always || plan.enabled[s.id]);
}

/**
 * Move a section, refusing moves that would break the deck.
 *
 * Welcome stays first and the close stays last. Not for tidiness: a deck whose
 * first page is a rent table opens with a number before it has said who is
 * speaking, and the landlord's first impression is a spreadsheet.
 */
export function reorder(plan: DeckPlan, id: string, delta: number): DeckPlan {
  const section = DECK_SECTIONS.find((s) => s.id === id);
  if (!section || section.always) return plan;

  const order = [...plan.order];
  const from = order.indexOf(id);
  const to = from + delta;
  // Index 0 and the last slot belong to the fixed pages.
  if (from < 0 || to < 1 || to > order.length - 2) return plan;
  order.splice(to, 0, ...order.splice(from, 1));
  return { ...plan, order };
}

/* ── choosing comparables ─────────────────────────────────────────────────── */

export interface Selectable {
  id: string;
  /** Same-sector comparables are the ones worth defending line by line. */
  nearness: "sector" | "district" | "area";
  letAgreed: boolean;
}

/**
 * What to tick for the agent, and what to leave for them.
 *
 * ONLY same-sector properties start selected. A pre-ticked box is an implicit
 * recommendation, and recommending a comparable from the other side of the
 * city is how an agent ends up defending a property they have never seen in
 * front of a landlord who knows the street.
 *
 * If that leaves nothing selected, the agent picks — which is the honest
 * outcome when we have nothing genuinely local.
 */
export function defaultSelection(rows: Selectable[]): string[] {
  return rows.filter((r) => r.nearness === "sector").map((r) => r.id);
}

/** £ per bedroom — the lettings answer to £/sqft, using inputs we actually hold. */
export function perBedroom(rentMonthly: number, beds: number | null): number | null {
  if (!beds || beds < 1) return null;
  return Math.round(rentMonthly / beds);
}

/**
 * Can the agent move on from this step?
 *
 * Always yes. Recorded as a function rather than left implicit because the
 * temptation to gate step three on "at least one comparable selected" is
 * strong and wrong: our book is genuinely thin in some postcodes, and trapping
 * an agent there just means they stop using the builder.
 */
export function canAdvance(_step: BuildStepId): boolean {
  return true;
}
