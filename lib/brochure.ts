import type { PresentDeck, SlideId } from "@/lib/present";

/**
 * The pre-appraisal brochure's slide list, as data the server can read.
 *
 * components/PreAppraisalBrochure is a client module, so nothing exported from
 * it can be CALLED on the server - the present page did exactly that to count
 * the sample's slides, and every /present/sample 500'd on 7 Oct 2026. The list
 * lives here instead; the component renders one slide per entry, in order.
 *
 * Each entry is the slide in the deck's own list (lib/present,
 * SLIDES_BY_KIND) that brochure slide stands for, so the presentation
 * builder's slide list and its preview can talk to each other.
 */
export const BROCHURE_COVERS: SlideId[] = ["welcome", "appointment", "appointment", "agent", "why", "questions", "questions"];

/* The builder lets an agent switch "Why The Letting Experts" off (the one
   removable slide in the pre-appraisal), and the brochure obeys. Returns the
   positions in BROCHURE_COVERS this deck shows. */
export function brochurePositions(deck: Pick<PresentDeck, "hidden">): number[] {
  return BROCHURE_COVERS.map((_, i) => i).filter((i) => !(BROCHURE_COVERS[i] === "why" && deck.hidden?.includes("why")));
}

/** How many slides this deck's brochure has. */
export const brochureCount = (deck: Pick<PresentDeck, "hidden">) => brochurePositions(deck).length;

/** The first brochure slide that stands for one of the deck's slide ids. */
export function brochureIndexOf(deck: Pick<PresentDeck, "hidden">, id: SlideId | undefined): number {
  return Math.max(0, brochurePositions(deck).findIndex((p) => BROCHURE_COVERS[p] === id));
}

/** Which of the deck's slide ids a brochure slide stands for. */
export function brochureCovers(deck: Pick<PresentDeck, "hidden">, i: number): SlideId {
  const list = brochurePositions(deck);
  return BROCHURE_COVERS[list[Math.max(0, Math.min(list.length - 1, i))]];
}
