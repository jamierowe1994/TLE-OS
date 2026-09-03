/**
 * What the landlord dashboard draws. Client-safe: types only.
 *
 * One shape, two feeders: the live home builds it from the appraisal journey
 * and the managed book (lib/landlord-account.ts), and the Raj sample builds
 * it by hand. The dashboard itself knows nothing about REX or appraisals.
 *
 * ── The spine drives the page, James 2 Sep ──────────────────────────────
 *
 * "The landlord will have his own timeline and spine going through the
 * middle, and that will then determine what the page looks like." So the
 * view carries a STAGE and a JOURNEY, and everything else - which next
 * steps show and in what order, what the activity says, what the documents
 * panel asks for - is derived from where they are. Six stops, in a
 * landlord's words: valuation, instruction signed, compliance, marketing,
 * viewings and offers, let agreed.
 */

export type Stage = "valuation" | "instruction" | "compliance" | "marketing" | "viewings" | "let";

export const STAGES: Array<{ id: Stage; label: string }> = [
  { id: "valuation", label: "Valuation" },
  { id: "instruction", label: "Instruction signed" },
  { id: "compliance", label: "Compliance" },
  { id: "marketing", label: "Marketing" },
  { id: "viewings", label: "Viewings / Offers" },
  { id: "let", label: "Let agreed" },
];

export interface JourneyStop {
  id: Stage;
  label: string;
  /** "12 May 2026", "In progress", "Upcoming". */
  sub: string;
  state: "done" | "current" | "upcoming";
}

export interface ViewStep {
  id: "presentation" | "sign" | "compliance" | "message" | "listing" | "viewings";
  label: string;
  sub: string;
  href: string | null;
  icon: string;
  external?: boolean;
}

export interface ViewDocument {
  title: string;
  sub: string;
  state: "uploaded" | "missing" | "pending";
}

export interface ViewActivity {
  title: string;
  sub: string;
  date: string;
  icon: string;
}

export interface LandlordView {
  greeting: string;
  intro: string;
  stage: Stage;
  journey: JourneyStop[];
  property: {
    address: string;
    postcode: string;
    /** "Being let", "Tenanted". */
    state: string;
    /** "Terraced house · 2 bed · 1 bath", or what we know. */
    facts: string[];
    rent: { figure: string | null; unit: string; caption: string };
    valuedOn: string | null;
    reference: string | null;
    /** Our photograph, once take-on has happened. Null before that, and the drawing stands in. */
    image: string | null;
    lat: number | null;
    lng: number | null;
  };
  steps: ViewStep[];
  documents: ViewDocument[];
  snapshot: { readinessPct: number; note: string; lines: Array<[string, string]> };
  activity: ViewActivity[];
  agent: { name: string; title?: string | null; phone?: string | null; email?: string | null; photo?: string | null } | null;
}

/**
 * The next steps, in the order that matters at each stage. James's order for
 * the instruction stage: presentation, contract, compliance, agent. After the
 * contract is signed the compliance moves to the front; once marketing is
 * live, the listing and viewings take over. Steps without a link still show,
 * greyed, so the shape of the page holds from one stage to the next.
 */
export function stepsForStage(stage: Stage, all: Record<ViewStep["id"], ViewStep>): ViewStep[] {
  const order: Record<Stage, ViewStep["id"][]> = {
    valuation: ["presentation", "message", "compliance", "sign"],
    instruction: ["presentation", "sign", "compliance", "message"],
    compliance: ["compliance", "presentation", "message", "sign"],
    marketing: ["listing", "compliance", "message", "presentation"],
    viewings: ["viewings", "listing", "message", "compliance"],
    let: ["viewings", "message", "compliance", "listing"],
  };
  return order[stage].map((id) => all[id]).filter(Boolean).slice(0, 4);
}
