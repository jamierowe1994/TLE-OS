/**
 * The journey page's words for each stop, shared by its two drawings
 * (JourneyView's classic page and JourneyViewCalm).
 *
 * SHORT is the same stage in one word, for a phone. James, 15 Sep 2026: "get
 * rid of the icon ... and then just say Current Stage, or instead of Current
 * Stage, maybe Signing." A 30px "Signing your instruction" over a 64px icon is
 * most of a phone screen spent saying where they are before anything says what
 * to do.
 */
export const SHORT: Record<string, string> = {
  valuation: "Valuation",
  instruction: "Signing",
  compliance: "Compliance",
  marketing: "Marketing",
  viewings: "Viewings",
  let: "Let agreed",
  management: "Managed",
};

/** The current-stage card's title, in words that read as a sentence. */
export const TITLE: Record<string, string> = {
  valuation: "Valuation in progress",
  instruction: "Signing your instruction",
  compliance: "Compliance in progress",
  marketing: "Marketing your property",
  viewings: "Viewings and offers",
  let: "Let agreed, moving in soon",
  management: "Your property is managed",
};
