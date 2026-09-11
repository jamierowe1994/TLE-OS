import type { LandlordView } from "@/lib/landlord-view";

/**
 * The landlord's journey in their words (James's journey page, 11 Sep 2026):
 * what happens at each stop, who does what, what it unlocks, and why it
 * matters. Plus the seventh stop the six-stage view does not carry - Move-in
 * and Management - which is where a tenanted, managed property lives.
 *
 * No em dashes in any of this copy: it is client-facing.
 */

export type Stop = { id: string; label: string; sub: string; state: "done" | "current" | "upcoming" };

export type StageCopy = {
  /** One line for the stage card. */
  what: string;
  /** The longer line on the current-stage card. */
  long: string;
  why: string;
  yourRole: string;
  ourRole: string;
  unlocks: string;
  icon: string;
};

export const STAGE_COPY: Record<string, StageCopy> = {
  valuation: {
    what: "We visit your property and give you a rental valuation and advice.",
    long: "We come round, look over the property and tell you what it should let for, and how we would let it.",
    why: "A realistic rent from the start means less time empty and the right tenant sooner.",
    yourRole: "Be at the property",
    ourRole: "Carry out the valuation",
    unlocks: "Your instruction",
    icon: "home",
  },
  instruction: {
    what: "You sign your management agreement with us.",
    long: "Your terms of business set out exactly what we do for you. Once they are signed, we set up your property file.",
    why: "Everyone knows where they stand, and we can start getting your property ready.",
    yourRole: "Sign the contract",
    ourRole: "Set up your property file",
    unlocks: "Compliance",
    icon: "pencil",
  },
  compliance: {
    what: "We arrange the safety checks and certificates a let needs.",
    long: "We're preparing your property for the rental market by completing essential safety checks and certificates.",
    why: "These checks keep your tenants safe, keep you legal and help you find a tenant faster.",
    yourRole: "Upload documents",
    ourRole: "Review and advise",
    unlocks: "Marketing your property",
    icon: "doc",
  },
  marketing: {
    what: "We create your listing, take professional photos and advertise your property.",
    long: "Your property is being photographed, written up and put in front of tenants on the major portals.",
    why: "Good photos and the right price are what bring the right tenants through the door.",
    yourRole: "None, we'll handle this",
    ourRole: "List and market",
    unlocks: "Viewings and offers",
    icon: "megaphone",
  },
  viewings: {
    what: "We run the viewings, share feedback and negotiate the best offer for you.",
    long: "Tenants are viewing your property. We tell you what they thought and bring every offer to you.",
    why: "Every viewing is a chance to find a tenant who will look after your home.",
    yourRole: "Consider offers",
    ourRole: "Arrange viewings",
    unlocks: "Let agreed",
    icon: "key",
  },
  let: {
    what: "We agree the tenancy and complete the pre-tenancy checks.",
    long: "You have a tenant. We are referencing them, preparing the tenancy and getting everything ready for move-in.",
    why: "Referencing and checks now protect you for the whole tenancy.",
    yourRole: "Approve the tenancy",
    ourRole: "Set up the tenancy",
    unlocks: "Move-in and management",
    icon: "file-contract",
  },
  management: {
    what: "Your tenant moves in and we look after the property for you.",
    long: "Your tenant is in. We collect the rent, keep the certificates in date and handle anything that needs fixing.",
    why: "A well-looked-after home keeps good tenants for longer.",
    yourRole: "None, sit back",
    ourRole: "Ongoing management",
    unlocks: "A hassle-free rental",
    icon: "setting",
  },
};

/**
 * The seven stops. The six from the view, then Move-in / Management - current
 * once the property is tenanted (a managed property), when the let itself is
 * done; upcoming before that.
 */
export function fullJourney(v: LandlordView): Stop[] {
  const tenanted = v.property.state === "Tenanted";
  const stops: Stop[] = v.journey.map((s) => ({ ...s }));
  if (tenanted) {
    const let_ = stops.find((s) => s.id === "let");
    if (let_) let_.state = "done";
  }
  stops.push({
    id: "management",
    label: "Move-in / Management",
    sub: tenanted ? "In progress" : "Upcoming",
    state: tenanted ? "current" : "upcoming",
  });
  return stops;
}
