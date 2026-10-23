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
 *  - its words delete or remove something that is not a test file;
 *  - it is anywhere in Admin, where every button is James's.
 */

export const NEVER_WORDS =
  /\b(publish(ed|ing)?|go(es)? live|push(ed|ing)? (it )?(to the portals|live)|put (it )?live|make (it )?live|put back on the portals|take off the portals|send (it )?to (rightmove|zoopla|onthemarket|the portals)|invite|reissue|phase \d|start phase|switch (it )?on for everyone)\b/i;

/* EDIT, NEVER DELETE (James, 23 Oct 2026): "we're never allowed to let Steve
   delete something, but to edit something, he should be able to ... The only
   time he can delete something is if it's a test file." A control whose words
   delete, remove or erase is never his, unless its own words say it is a test
   file (the server still checks the file really is one before it goes). */
export const DELETE_WORDS = /\b(delet(e|es|ed|ing)|remov(e|es|ed|ing)|eras(e|es|ed|ing)|wipe|discard|bin (it|this)|throw (it )?away|destroy)\b/i;
const TEST_FILE_WORDS = /\btest (file|appraisal|lead|record)\b/i;

export function neverPress(label: string, path: string | null | undefined): boolean {
  if ((path ?? "").startsWith("/admin")) return true;
  if (DELETE_WORDS.test(label) && !TEST_FILE_WORDS.test(label)) return true;
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
  /** A step presses something that deletes (only ever a test file - see
   *  neverPress). The card asks "Are you sure that you want to action this
   *  step?" before anything runs (James, 23 Oct 2026). */
  deletes?: string[];
}

/** The words of any delete a plan's steps would press, for the "Are you sure" question. */
export const deleteStepsOf = (steps: ScreenStep[]): string[] =>
  steps.filter((s) => (s.do === "press" || s.do === "tick" || s.do === "untick") && DELETE_WORDS.test(s.says)).map((s) => s.says);
