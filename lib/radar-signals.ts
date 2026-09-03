/**
 * Landlord Radar — the signals, the stages, and the shape of a prospect.
 *
 * Client-safe on purpose: the board renders these labels and the server
 * computes against these keys, and they must be the same list. The weights
 * are here too, in one place, so tuning them is a one-line change and the
 * screen can explain a score by showing its parts.
 *
 * The weights are a starting guess. Phase 3 of docs/LANDLORD-RADAR.md replaces
 * them with weights learned from which signals led to booked appraisals.
 */

export type SignalKey =
  | "self_managing"
  | "withdrawn"
  | "switched_agent"
  | "fallen_through"
  | "stale_90"
  | "stale_60"
  | "stale_30"
  | "relisted"
  | "reduced"
  | "competitor_new"
  | "company_owned"
  | "let_to_sale"
  | "sale_stuck"
  | "sale_to_let"
  | "just_bought"
  | "anniversary_due"
  | "added_by_hand"
  | "hmo_licence_expiring"
  | "epc_below_c"
  | "epc_expiring";

export const SIGNALS: Record<SignalKey, { label: string; weight: number; why: string }> = {
  self_managing: {
    label: "Self-managing",
    weight: 40,
    why: "Listed privately. Lost Section 21 in May, and the PRS register and Making Tax Digital are next.",
  },
  withdrawn: {
    label: "Withdrawn",
    weight: 25,
    why: "Taken down within two months of listing and never marked let. Fell out with the agent, gave up, or let privately.",
  },
  switched_agent: {
    label: "Switched agent",
    weight: 30,
    why: "Back on the market with a different agent inside a year. Proven willing to move.",
  },
  fallen_through: {
    label: "Fallen through",
    weight: 30,
    why: "A let was agreed and then lost. The landlord is exposed and the agent looks bad.",
  },
  stale_90: { label: "90+ days", weight: 30, why: "Three months on the market. The agent is not shifting it." },
  stale_60: { label: "60+ days", weight: 20, why: "Two months on the market." },
  stale_30: { label: "30+ days", weight: 10, why: "A month on the market." },
  relisted: {
    label: "Back on market",
    weight: 25,
    why: "Listed again within a year of the last time. A short tenancy, or churn.",
  },
  reduced: { label: "Rent reduced", weight: 20, why: "The asking rent came down. The landlord is already unhappy." },
  competitor_new: {
    label: "New with a competitor",
    weight: 5,
    why: "Just listed with someone else. Worth knowing, not worth chasing yet.",
  },
  company_owned: {
    label: "Company owned",
    weight: 10,
    why: "The Land Registry names a company as the owner. Contactable at its registered office by post, phone and email, no title to buy.",
  },
  let_to_sale: {
    label: "Let, now for sale",
    weight: 35,
    why: "It was a rental and the landlord has put it up for sale. Either they are leaving, or a sale that stalls comes back to let.",
  },
  sale_stuck: {
    label: "Not selling",
    weight: 20,
    why: "Four months for sale and still there. A vendor who cannot sell is a landlord in waiting.",
  },
  sale_to_let: {
    label: "Could not sell, now to let",
    weight: 30,
    why: "It was for sale, did not go, and is now to let. A landlord by circumstance, often with no agent relationship yet.",
  },
  just_bought: {
    label: "Just bought",
    weight: 35,
    why: "Sold in the last year, now to let. A brand new landlord, deciding how to run it right now.",
  },
  anniversary_due: {
    label: "Anniversary due",
    weight: 25,
    why: "The tenancy started about a year ago. Fixed terms end and rents get reviewed around now, and this is when a landlord decides whether to keep the agent. Write before it, not after.",
  },
  added_by_hand: {
    label: "Added by hand",
    weight: 20,
    why: "A colleague put this on the list themselves: seen on Facebook, a board on the street, a conversation. The reason is on the record.",
  },
  hmo_licence_expiring: {
    label: "HMO licence expiring",
    weight: 20,
    why: "The council's HMO licence runs out within five months. Renewal is paperwork, inspections and fees; a landlord in that process is open to help running the house.",
  },
  epc_below_c: {
    label: "EPC below C",
    weight: 10,
    why: "Every private rental must reach EPC C by October 2030. The work is the landlord's to organise, and most do not know where to start.",
  },
  epc_expiring: {
    label: "EPC expiring",
    weight: 15,
    why: "The certificate is in its tenth year. Without a new one the property cannot be re-let, so a decision is coming.",
  },
};

export const SIGNAL_ORDER = Object.keys(SIGNALS) as SignalKey[];

/**
 * One colour per signal, the same everywhere. When signals are switched on,
 * a pin takes the colour of the strongest switched-on signal it carries; the
 * legend shows the same swatches. Chosen to stay apart from each other and
 * to read on a pale map; `ink` says whether the number on the pin is dark.
 */
export const SIGNAL_COLOUR: Record<SignalKey, { fill: string; ink?: boolean }> = {
  self_managing: { fill: "#b5453c" },
  withdrawn: { fill: "#6b4c9a" },
  switched_agent: { fill: "#2f6f9f" },
  fallen_through: { fill: "#c0392b" },
  stale_90: { fill: "#7a5230" },
  stale_60: { fill: "#a9783a" },
  stale_30: { fill: "#d9b46a", ink: true },
  relisted: { fill: "#2a8a7a" },
  reduced: { fill: "#d97b2b" },
  competitor_new: { fill: "#8a8a8a" },
  company_owned: { fill: "#1f5f8b" },
  let_to_sale: { fill: "#8d3b72" },
  sale_stuck: { fill: "#5c5c8a" },
  sale_to_let: { fill: "#2e7d4f" },
  just_bought: { fill: "#1b9e77" },
  anniversary_due: { fill: "#e6b422", ink: true },
  added_by_hand: { fill: "#3d3d3d" },
  hmo_licence_expiring: { fill: "#9c6b00" },
  epc_below_c: { fill: "#6a994e" },
  epc_expiring: { fill: "#386641" },
};

export interface Signal {
  key: SignalKey;
  /** One line, in an agent's words, on what was seen. "64 days on the market with Leaders". */
  detail: string;
}

export const STAGES = [
  "new",
  "queued",
  "contacted",
  "appraisal_booked",
  "won",
  "not_interested",
  "do_not_contact",
] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABEL: Record<Stage, string> = {
  new: "New",
  queued: "Queued",
  contacted: "Contacted",
  appraisal_booked: "Appraisal booked",
  won: "Won",
  not_interested: "Not interested",
  do_not_contact: "Do not contact",
};

export const STAGE_TONE: Record<Stage, "neutral" | "accent" | "good"> = {
  new: "neutral",
  queued: "accent",
  contacted: "accent",
  appraisal_booked: "good",
  won: "good",
  not_interested: "neutral",
  do_not_contact: "neutral",
};

export function isStage(v: unknown): v is Stage {
  return typeof v === "string" && (STAGES as readonly string[]).includes(v);
}

/** A prospect as the API hands it to the board. Dates are ISO strings. */
export interface Prospect {
  property_key: string;
  listing_key: string | null;
  uprn: string | null;
  address: string;
  street: string | null;
  postcode: string;
  sector: string | null;
  district: string | null;
  beds: number | null;
  property_type: string | null;
  rent: number | null;
  /** Which feed the current listing is in. */
  market: "let" | "sale";
  asking_price: number | null;
  /** When the tenancy probably began, the next anniversary, and how we know. */
  tenancy_start: string | null;
  next_anniversary: string | null;
  tenancy_basis: "observed" | "estimated" | null;
  /** Why a colleague added it, when they did. */
  hand_reason: string | null;
  /** The council HMO licence on this door, if the register has one. */
  hmo_licence_ref: string | null;
  hmo_expires_on: string | null;
  epc_band: string | null;
  epc_registered_on: string | null;
  /** 0 to 100 from the certificate; null without one. */
  condition_score: number | null;
  /** The advert's photo: our archived copy when there is one, else the feed's link. */
  photo: string | null;
  agent: string | null;
  status: string | null;
  listed_on: string | null;
  lat: number | null;
  lon: number | null;
  signals: Signal[];
  score: number;
  stage: Stage;
  assigned_to: string | null;
  notes: string;
  first_flagged: string;
  last_signal_at: string | null;
  last_action_at: string | null;
  /** Bond: the front door we settled on, and how sure we are. */
  resolved_address: string | null;
  resolved_uprn: string | null;
  address_confidence: number | null;
  address_candidates: AddressCandidate[] | null;
  resolved_at: string | null;
  /** The company on the title, when the Land Registry files matched. */
  company: OwnerCompany | null;
  /** The owner somebody recorded or a provider returned. */
  owner: OwnerRecord | null;
}

export interface OwnerCompany {
  name: string;
  number: string | null;
  address: string;
  title_number: string | null;
}

export interface OwnerRecord {
  name: string;
  address: string;
  source: string;
  title_number: string | null;
  at: string;
}

export interface AddressCandidate {
  hs_id: string;
  label: string;
  beds: number | null;
  category: string | null;
  /** True for the candidates whose beds and type agree with the listing. */
  fits: boolean;
}

export interface RadarSummary {
  districts: number;
  districtList: string[];
  lastRun: string | null;
  active: number;
  newToday: number;
  bySignal: Partial<Record<SignalKey, number>>;
  byStage: Partial<Record<Stage, number>>;
}

/** Listers that mean "no agent": the landlord is doing it themselves. */
export function isPrivateLister(agent: string | null | undefined): boolean {
  return /openrent|private\s*landlord|gumtree|spareroom|lettingaproperty|upad|\bprivate\b/i.test(agent ?? "");
}

/** Our own stock. Never a prospect, whatever the signals say. */
export function isOurs(agent: string | null | undefined): boolean {
  return /letting(s)?\s*experts/i.test(agent ?? "");
}
