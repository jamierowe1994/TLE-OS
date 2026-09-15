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

/**
 * "managed" is the seventh stop (James, 12 Sep 2026): the tenant is in and
 * the portal becomes a management profile - the tenancy, the contracts, the
 * maintenance and the renewals. The six-stop spine treats it as everything
 * done, with Move-in / Management current (lib/landlord-journey).
 */
export type Stage = "valuation" | "instruction" | "compliance" | "marketing" | "viewings" | "let" | "managed";

/** Once the property is let, the pages that only make sense with a tenant unlock. */
export const isLet = (v: { stage: Stage; property: { state: string } }) => v.stage === "managed" || v.property.state === "Tenanted";

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
  id: "presentation" | "sign" | "compliance" | "message" | "listing" | "viewings" | "maintenance" | "renewal" | "certificates" | "tenancy";
  label: string;
  sub: string;
  href: string | null;
  icon: string;
  external?: boolean;
  /**
   * Done steps come OFF the list. James, 2 Sep: "if they do it, it will take
   * it off the list... it will just show what's left."
   */
  done?: boolean;
  /**
   * A step that does something here rather than linking away: "sign" opens
   * a DocuSeal session for this landlord, "message" opens the thread with
   * their agent. The live home sets these; the sample links.
   */
  action?: "sign" | "message" | "presentation";
}

/** An offer on the landlord's property, as they should read it. */
export interface ViewOffer {
  id: string;
  /** "£1,250 per month" */
  amount: string;
  /** Received, With you, Accepted, Unsuccessful. */
  status: "received" | "with-you" | "accepted" | "unsuccessful";
  statusLabel: string;
  /** "2 adults, 1 child, no pets" */
  who: string;
  /** First names only. */
  applicants: string;
  moveIn: string | null;
  received: string | null;
  /** What the applicant asked for, if anything. */
  conditions: string | null;
}

/** The let moving through Kirstie's eight stages, in the landlord's words. */
export interface ViewProgress {
  property: string;
  tenants: string;
  moveIn: string | null;
  rentPcm: number | null;
  stageKey: string;
  stages: Array<{ key: string; label: string; state: "done" | "current" | "upcoming" }>;
  now: string;
  next: string;
}

export interface ViewDocument {
  title: string;
  sub: string;
  state: "uploaded" | "missing" | "pending";
  /** Where to open it, once it is ours to open. */
  href?: string | null;
}

export interface ViewMessage {
  id: string;
  from: "landlord" | "agent";
  body: string;
  sentAt: string;
  /** Reached the agent's inbox. False means stored on the file, not yet emailed. */
  emailed: boolean;
}

/** The listing, once marketing is live: what tenants are seeing. */
export interface ViewMarketing {
  live: boolean;
  /** "2 June 2026" */
  liveSince: string | null;
  portals: Array<{ name: string; href: string | null }>;
  /** Our photographs, in REX's order. */
  photos: string[];
  /** "Professional photos taken 28 May", "Listing being written up". */
  note: string;
}

/** A viewing on the property, as the landlord should read it. */
export interface ViewViewing {
  id: string;
  /** "Sat 13 Jun, 10:30" */
  when: string;
  /** "A couple, relocating for work" - never a full name before an offer. */
  who: string;
  state: "booked" | "done" | "cancelled";
  /** What they said, once we have it. */
  feedback: string | null;
}

/** The tenancy, once the tenant is in: the management profile's spine. */
export interface ViewTenancy {
  tenant: string;
  started: string | null;
  ends: string | null;
  /** "Renewal due 30 September 2026 - we'll be in touch in July". */
  renewal: string;
  renewalDue: string | null;
  rent: string;
  /** "Paid on time, every month" / "October's rent is 3 days late". */
  rentStatus: string;
  deposit: string | null;
  /** The signed tenancy agreement, once ours to open. */
  agreementHref: string | null;
  agreementSigned: string | null;
  service: string | null;
}

/** Maintenance in one line, for the home page once the property is let. */
export interface ViewMaintenance {
  open: number;
  needsYou: number;
  nextVisit: string | null;
  /** "All up to date" / "1 job waiting on you" / "2 jobs in hand". */
  headline: string;
  sub: string;
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
  /** The OS appraisal this file is about, for the tiles that act on it. */
  appraisalId?: string | null;
  /**
   * Their contract, when it exists as a link rather than something to mint -
   * the harness's drafted one. Kept OUTSIDE the steps because the button
   * under the presentation must work at the valuation stop, where the sign
   * step is deliberately held back until the deck has been read: the deck is
   * exactly where we want them to sign from.
   */
  contractUrl?: string | null;
  /**
   * The post-appraisal deck, when one has been sent, for the "View
   * presentation" step to open as a book here (components/PresentModal)
   * rather than linking away. The sample carries the showroom deck; the
   * live home will carry the landlord's own once decks are looked up by
   * appraisal - nothing does that yet.
   */
  presentation?: import("@/lib/present").PresentDeck | null;
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
  /** Offers on the property, newest first. Absent before marketing. */
  offers?: ViewOffer[];
  /** The accepted let, step by step. Absent until a deal exists in Propoly. */
  progress?: ViewProgress | null;
  /** The listing, from marketing onwards. */
  marketing?: ViewMarketing | null;
  /** Viewings on the property, from marketing onwards. */
  viewings?: ViewViewing[];
  /** The tenancy, once the tenant is in. */
  tenancy?: ViewTenancy | null;
  /** Maintenance in one line, once the property is let. */
  maintenance?: ViewMaintenance | null;
  snapshot: { readinessPct: number; note: string; lines: Array<[string, string]> };
  activity: ViewActivity[];
  messages?: ViewMessage[];
  agent: { name: string; title?: string | null; phone?: string | null; email?: string | null; photo?: string | null } | null;
}

/**
 * The next steps, in the order that matters at each stage. James's order for
 * the instruction stage: presentation, contract, compliance, agent. After the
 * contract is signed the compliance moves to the front; once marketing is
 * live, the listing and viewings take over. Steps without a link still show,
 * greyed, so the shape of the page holds from one stage to the next.
 */
export function stepsForStage(
  stage: Stage,
  all: Record<ViewStep["id"], ViewStep>,
  opts: {
    /**
     * Has the landlord actually opened their presentation?
     *
     * James, 14 Sep 2026: "when we send over the presentation, the next step
     * should be View your presentation, rather than it being Sign your
     * contract. Once I've viewed it once ... it should then change to the view
     * we've got now."
     *
     * Which is the right way round. Asking somebody to sign a management
     * agreement before they have read what they are agreeing to is the wrong
     * first thing to put in front of them, and it is the one tile a landlord
     * cannot undo. So until the deck is opened there is one next step, and it
     * is the deck.
     *
     * Undefined means nobody knows - a stage with no presentation in it, or a
     * caller that does not track opens - and the tile behaves as it always
     * did. Only a definite FALSE holds the contract back.
     */
    presentationOpened?: boolean;
  } = {}
): ViewStep[] {
  const order: Record<Stage, ViewStep["id"][]> = {
    valuation: ["presentation", "message", "compliance", "sign"],
    instruction: ["presentation", "sign", "compliance", "message"],
    compliance: ["compliance", "presentation", "message", "sign"],
    marketing: ["listing", "compliance", "message", "presentation"],
    viewings: ["viewings", "listing", "message", "compliance"],
    let: ["tenancy", "viewings", "message", "compliance"],
    managed: ["maintenance", "renewal", "certificates", "message"],
  };
  /* Held back only where signing is the thing being offered. Once they are
     past instruction the contract is history and the order says so anyway. */
  const holdSign =
    opts.presentationOpened === false && (stage === "valuation" || stage === "instruction");

  /**
   * SIGNED, SO THE DECK COMES OFF TOO.
   *
   * James, 15 Sep 2026: "as soon as they sign the contract ... the View
   * presentation, Sign contract button will disappear, and then the next
   * button will be Upload your compliance document and Message your agent."
   *
   * Which is the whole point of a list that empties. The presentation is what
   * persuaded them; once they have signed it has done its work, and leaving it
   * at the top of a landlord's file says we still have something to sell them.
   * It does not disappear - it stays in their documents, where a thing you want
   * to look at again lives.
   */
  const signed = all.sign?.done === true;

  return order[stage]
    .map((id) => all[id])
    .filter(
      (s): s is ViewStep =>
        Boolean(s) && !s.done && !(holdSign && s.id === "sign") && !(signed && s.id === "presentation")
    )
    .slice(0, 4);
}
