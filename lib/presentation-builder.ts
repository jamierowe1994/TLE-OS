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
  { id: "review", label: "Review", blurb: "Which pages go in the presentation." },
] as const;

export type BuildStepId = (typeof BUILD_STEPS)[number]["id"];

/* ── the pages a deck carries ─────────────────────────────────────────────────

   There used to be a DECK_SECTIONS list here, with switches and up/down
   arrows on the Review step. Removed 16 Sep 2026: nothing read it. The plan
   it built never reached the preview or the deck, and its eight "sections"
   were not the deck's slides anyway. The Review step now lists the real
   slides from lib/present (slidesInKind) and switches write
   PresentDeck.hidden, which slidesFor honours.

   Reordering went with it on purpose. The deck's order IS its argument, and
   the agenda slide promises those chapters in that order - an agent moving
   the fees ahead of the evidence would break the promise on page two. */

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
