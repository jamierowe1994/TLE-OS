/**
 * What a pop-up guide is made of, for every shelf that has them.
 *
 * Two shelves share this shape: Kirstie's pre-tenancy guides
 * (lib/pretenancy-guides) and the agents' guides (lib/agent-guides). Both are
 * drawn by components/GuideModal, so a guide written for one side reads the
 * same as one written for the other.
 *
 * ── The four questions ────────────────────────────────────────────────────
 *
 * James, 16 Sep 2026: each step should say "what each step does, why it's
 * important, how it works, what it will send". `body` is the first and is
 * always there. The other three are optional, because not every step sends
 * something and a heading over an empty answer is padding. When a step does
 * send something, `sends` is the one to fill in first: it is the part an
 * agent cannot see from their own screen.
 *
 * No em dashes in any of it: this copy is read by people.
 */

export type GuideStep = {
  title: string;
  /** What this step is and what you do on it. */
  body: string;
  /** Why it matters. What goes wrong when it is skipped or done badly. */
  why?: string;
  /** How it works underneath: where the figures come from, what gets checked. */
  how?: string;
  /** What leaves the building on this step, and who receives it. */
  sends?: string;
  image?: string;
  /** A short line under the picture, when the picture needs one. */
  caption?: string;
};

export type Guide = {
  id: string;
  title: string;
  blurb: string;
  icon: string;
  /** The page this guide is about, for the "Open the screen" button. */
  href: string;
  minutes: number;
  steps: GuideStep[];
  /** A practice run that covers this guide, offered at the end of the reading. */
  practice?: { href: string; label: string };
};
