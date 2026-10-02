/**
 * WHAT STEVE NEVER PRESSES (James, 2 Oct 2026): "It should never be able to
 * push the properties live, but it should be able to get it ready."
 *
 * One rule, read on both sides: the browser leaves these controls out of what
 * it tells him is on screen and refuses them again at the moment of pressing,
 * and the server refuses any step that names one. Three ways to be caught:
 *
 *  - the control, or anything around it, carries data-steve-never (the push
 *    to the portals, the portal switch, the pilot phases, team invites);
 *  - its words say it goes live, publishes or invites;
 *  - it is anywhere in Admin, where every button is James's.
 */

export const NEVER_WORDS =
  /\b(publish(ed|ing)?|go(es)? live|push(ed|ing)? (it )?(to the portals|live)|put (it )?live|make (it )?live|put back on the portals|take off the portals|send (it )?to (rightmove|zoopla|onthemarket|the portals)|invite|reissue|phase \d|start phase|switch (it )?on for everyone)\b/i;

export function neverPress(label: string, path: string | null | undefined): boolean {
  if ((path ?? "").startsWith("/admin")) return true;
  return NEVER_WORDS.test(label);
}

export type ScreenControlKind = "button" | "link" | "tab" | "text" | "number" | "date" | "select" | "checkbox" | "textarea";

/** One thing on their screen he may touch, as the browser saw it. */
export interface ScreenControl {
  ref: string;
  kind: ScreenControlKind;
  label: string;
  value?: string;
  options?: string[];
  /** Seen, but his to read and never to press. */
  never?: boolean;
}

export interface ScreenSnapshot {
  title: string;
  headings: string[];
  controls: ScreenControl[];
}

/** One thing he asks the browser to do. */
export interface ScreenStep {
  ref: string;
  do: "type" | "choose" | "tick" | "untick" | "press";
  value?: string;
  /** The words for the card: "Type 1,250 into Rent". */
  says: string;
}

export interface ScreenPlan {
  summary: string;
  steps: ScreenStep[];
  /** These steps open what the rest of the job needs (a tab, a form, a
   *  drawer): once they have run he is shown the new screen and carries on. */
  carryOn?: boolean;
}
