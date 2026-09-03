/**
 * What the landlord dashboard draws. Client-safe: types only.
 *
 * One shape, two feeders: the live home builds it from the appraisal journey
 * and the managed book (lib/landlord-account.ts), and the Raj sample builds
 * it by hand. The dashboard itself knows nothing about REX or appraisals -
 * it is a layout, and the layout is the thing Susan is deciding on.
 *
 * ── The simpler shape, James 2 Sep ───────────────────────────────────────
 *
 * "It feels complicated... a lot of buttons... we just want a really simple
 * process." So: ONE next step above everything, then five panels. The map
 * with three tiles under it - view the presentation, sign the terms, what
 * we need. The agent, properly, with the message box inside their card. The
 * presentation. The property. And what we need from them, under the grid,
 * as the only place documents are asked for.
 */

export interface ViewAction {
  label: string;
  hint?: string;
  href: string | null;
  icon: string;
  /** Dark tiles are the ones that do something now; light ones wait. */
  tone: "dark" | "light";
  /** Opens in a new tab (a presentation, a signing page). */
  external?: boolean;
}

export interface ViewNeed {
  title: string;
  sub?: string;
  done: boolean;
}

export interface LandlordView {
  greeting: string;
  intro: string;
  /** The one thing to do now. A landlord who reads only this line does the right thing. */
  next: { label: string; hint?: string; href: string | null; external?: boolean };
  property: {
    address: string;
    postcode: string;
    /** Our photograph, once take-on has happened. Null before that. */
    image: string | null;
    lat: number | null;
    lng: number | null;
    /** Under the address in the details panel: "Valued 31 August by Rhiannon Dodge". */
    subtitle: string;
    /** The pill beside the panel title: "Being let", "Tenanted". */
    state: string;
  };
  beats: string[];
  at: number;
  status: string;
  /** Exactly three: the presentation, the terms, what we need. */
  actions: ViewAction[];
  needs: ViewNeed[];
  valuation: {
    figure: string | null;
    unit: string;
    caption: string;
    lines: Array<[string, string]>;
  };
  deck: { title: string; sub: string; href: string | null; image: string | null } | null;
  agent: { name: string; title?: string | null; phone?: string | null; email?: string | null; photo?: string | null; bio?: string | null } | null;
}
