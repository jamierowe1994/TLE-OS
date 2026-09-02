/**
 * What the landlord dashboard draws. Client-safe: types only.
 *
 * One shape, two feeders: the live home builds it from the appraisal journey
 * and the managed book (lib/landlord-account.ts), and the Raj sample builds
 * it by hand. The dashboard itself knows nothing about REX or appraisals -
 * it is a layout, and the layout is the thing Susan is deciding on.
 *
 * The layout, from James's reference (2 Sep): white, three columns. Left is
 * the location - a greyscale map with the address card over it - then a
 * bento of actions. Middle is what there is to do, a way to ask the agent,
 * and the presentation. Right is the property itself: name, photograph,
 * where it is on the journey, the figure, and how ready it is to let.
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

export interface ViewTodo {
  title: string;
  sub?: string;
  done: boolean;
  href?: string | null;
  icon: string;
}

export interface LandlordView {
  greeting: string;
  intro: string;
  property: {
    address: string;
    postcode: string;
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
  actions: ViewAction[];
  todos: ViewTodo[];
  valuation: {
    figure: string | null;
    unit: string;
    caption: string;
    lines: Array<[string, string]>;
  };
  readiness: { pct: number; title: string; note: string };
  deck: { title: string; sub: string; href: string | null; image: string | null } | null;
  agent: { name: string; title?: string | null; phone?: string | null; email?: string | null; photo?: string | null } | null;
}
