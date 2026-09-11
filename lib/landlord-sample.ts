import rexSample from "@/lib/rex-sample.json";
import { STAGES, stepsForStage, type LandlordView, type Stage } from "@/lib/landlord-view";

/**
 * THE SAMPLE. Raj Chauhan, two invented properties, every figure typed in.
 *
 * Kept for walking people through what the portal will do once every
 * section is live, and drawn with the same dashboard the live home uses, so
 * what Susan decides on is what a landlord gets. The live portal at
 * /landlord shows a real landlord only what is real today.
 *
 * Raj has had the valuation and is about to sign - the stage James asked
 * to design for. Change STAGE below to see the page at another stop: the
 * spine, the next steps and the activity all follow it.
 */

const STAGE: Stage = "instruction";

type Listing = { id: string; name: string; locality: string; rent: number | null; image: string | null };
const LISTINGS = rexSample.listings as Listing[];
export const img = (name: string) => LISTINGS.find((l) => l.name.includes(name))?.image ?? null;

const at = STAGES.findIndex((s) => s.id === STAGE);

export const RAJ: LandlordView = {
  greeting: "Hello, Raj",
  intro: "Your property journey is underway. Here's what you need to know.",
  stage: STAGE,
  journey: STAGES.map((s, i) => ({
    id: s.id,
    label: s.label,
    sub: i < at ? "12 May 2026" : i === at ? "In progress" : "Upcoming",
    state: i < at ? "done" : i === at ? "current" : "upcoming",
  })),
  property: {
    address: "8 Recreation Terrace, Nottingham",
    postcode: "NG2 3AB",
    state: "Being let",
    facts: ["Terraced house", "2 bed", "1 bath"],
    rent: { figure: "£850", unit: "per month", caption: "Asking rent" },
    valuedOn: "12 May 2026",
    reference: "NCL 3AB",
    image: null,
    lat: 52.9548,
    lng: -1.1581,
  },
  steps: stepsForStage(STAGE, {
    presentation: { id: "presentation", label: "View presentation", sub: "See how we'll let your property for you", href: "#", icon: "analytics", external: true },
    sign: { id: "sign", label: "Sign your contract", sub: "Review and sign your management terms", href: "#", icon: "pencil", external: true },
    compliance: { id: "compliance", label: "Upload compliance documents", sub: "Add EICR, EPC and other essentials", href: "#documents", icon: "upload" },
    message: { id: "message", label: "Message your agent", sub: "Ask questions or share information", href: null, icon: "message", action: "message" },
    listing: { id: "listing", label: "See your listing", sub: "Live on Rightmove and Zoopla", href: null, icon: "home" },
    viewings: { id: "viewings", label: "Viewings and offers", sub: "Who has been, and what they said", href: null, icon: "key" },
  }),
  documents: [
    { title: "Electrical safety report (EICR)", sub: "Uploaded  •  12 May 2026", state: "uploaded" },
    { title: "Proof of ownership", sub: "Uploaded  •  12 May 2026", state: "uploaded" },
    { title: "Energy Performance Certificate (EPC)", sub: "Missing", state: "missing" },
    { title: "Right to rent ID", sub: "Missing", state: "missing" },
  ],
  snapshot: {
    readinessPct: 65,
    note: "You're making great progress.",
    lines: [
      ["Asking rent", "£850 / month"],
      ["Service", "Rent collection"],
      ["Management fee", "8% of rent"],
      ["Set-up fee", "£300"],
      ["Marketing", "Included"],
    ],
  },
  activity: [
    { title: "Presentation shared", sub: "Sam shared the presentation with you", date: "12 May 2026", icon: "message" },
    { title: "Instruction started", sub: "Let's get everything in place", date: "12 May 2026", icon: "note" },
    { title: "Property valued", sub: "We've agreed your asking rent", date: "12 May 2026", icon: "pencil" },
  ],
  messages: [
    { id: "m1", from: "landlord", body: "Hi Sam, is the EPC from 2023 still fine to use?", sentAt: "2026-05-12T10:12:00Z", emailed: true },
    { id: "m2", from: "agent", body: "It is, Raj. Valid until 2033, so nothing to do there. The EICR is the one we need.", sentAt: "2026-05-12T10:40:00Z", emailed: true },
  ],
  agent: { name: "Sam Whitaker", title: "Property Expert, Nottingham", phone: "0115 123 4567", email: "sam@thelettingexperts.co.uk", photo: null },
};

