/**
 * WHAT A LISTING MUST HAVE BEFORE IT GOES LIVE - one rule, read by the
 * Marketing form (the Required marks and the "done" count), the listing's
 * Put it live card, and the push route on the server (15 Sep 2026).
 *
 * Two sources, merged into one list so an agent sees fields, not reasons:
 *   - what the portal feeds refuse without (measured on 100 rentals): rent,
 *     available date, bedrooms, bathrooms, property type, a headline and
 *     description, a main photo;
 *   - what National Trading Standards expects on every rental advert: the
 *     deposit and council tax band up front, then parking and the utilities
 *     and broadband one click away. Key features and furnishing are James's.
 *
 * No imports: the browser and the server both read it.
 */

export const OPTIONS = {
  councilTaxBand: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "Exempt"],
  parking: ["Allocated bay", "Communal parking", "Garage", "No parking", "On drive", "On street", "Residents permit", "Secure parking"],
  electricity: ["Mains Supply", "Private Supply", "Solar Panels", "Wind Turbine"],
  water: ["Mains Supply", "Private Supply"],
  sewerage: ["Mains Supply", "Private Supply"],
  broadband: ["ADSL", "Cable", "FTTC", "FTTP", "None"],
  heating: ["Gas central heating", "Electric heating", "Electric storage heaters", "Air source heat pump", "Oil central heating", "Communal heating", "LPG", "None"],
  furnishing: ["Unfurnished", "Part furnished", "Furnished"],
  pets: ["Considered", "No pets"],
  outsideSpace: ["Private garden", "Communal garden", "Balcony", "Terrace", "Yard", "None"],
} as const;

/** What the form holds, for checking. */
export interface RequirementInput {
  rent: number | null;
  deposit: number | null;
  availableFrom: string | null;
  beds: number | null;
  baths: number | null;
  propertyType: string | null;
  heading: string;
  body: string;
  highlights: string[];
  photos: number;
  councilTaxBand: string | null | undefined;
  parking: string | null | undefined;
  electricity: string | null | undefined;
  water: string | null | undefined;
  sewerage: string | null | undefined;
  broadband: string | null | undefined;
  heating: string | null | undefined;
  furnishing: string | null | undefined;
  /** The EPC band. Undefined where the caller does not know it (the new-listing panel). */
  epcBand?: string | null;
  /** Scottish homes only: the landlord's registration number, by law on every advert. */
  landlordRegistration?: string | null;
  /** Scottish homes: the letting agent's own registration number (LARN). */
  agentLarn?: string | null;
  scotland?: boolean;
}

/** How a rental is let, and what we do for the landlord (REX's own lists). */
export const LET_TYPES = [
  { id: "long_term", label: "Long term" },
  { id: "short_term", label: "Short term" },
];
export const SERVICE_LEVELS = [
  { id: "managed", label: "Managed" },
  { id: "rent_collect", label: "Rent collect" },
  { id: "let_only", label: "Let only" },
];

export const MIN_FEATURES = 5;
/** How many "Fill it in for me" writes: room for the agent to add their own. */
export const MAX_FEATURES_AI = 8;

export type RequirementId = keyof RequirementInput;

const filled = (v: unknown) => (typeof v === "string" ? v.trim().length > 0 : v != null);

/*
 * THE MINIMUM TO GO ON THE PORTALS (James, 6 Oct 2026): "If they're not
 * mandatory fields to post onto Rightmove, don't make them mandatory." Every
 * one of the original list was blocking a push, so 6 Ruskin Place sat
 * waiting on broadband and heating. Required now is what the portal feeds
 * refuse without, what Trading Standards puts on every advert (rent, deposit,
 * council tax), and what the law adds: the EPC band everywhere, and in
 * Scotland the landlord's registration number. The rest is RECOMMENDED: shown,
 * counted separately, never in the way.
 */
export const REQUIREMENTS: { id: RequirementId; label: string; ok: (i: RequirementInput) => boolean }[] = [
  { id: "photos", label: "Photos", ok: (i) => i.photos > 0 },
  { id: "heading", label: "Headline", ok: (i) => filled(i.heading) && i.heading.length <= 255 },
  { id: "body", label: "Description", ok: (i) => i.body.trim().length >= 80 },
  { id: "rent", label: "Rent", ok: (i) => i.rent != null && i.rent > 0 },
  { id: "deposit", label: "Deposit", ok: (i) => i.deposit != null },
  { id: "availableFrom", label: "Available from", ok: (i) => filled(i.availableFrom) },
  { id: "propertyType", label: "Property type", ok: (i) => filled(i.propertyType) },
  { id: "beds", label: "Bedrooms", ok: (i) => i.beds != null },
  { id: "baths", label: "Bathrooms", ok: (i) => i.baths != null && i.baths > 0 },
  { id: "councilTaxBand", label: "Council tax band", ok: (i) => filled(i.councilTaxBand) },
  /* Undefined = not known to this caller, so not judged here. */
  { id: "epcBand", label: "EPC rating", ok: (i) => i.epcBand === undefined || filled(i.epcBand) },
  { id: "landlordRegistration", label: "Landlord registration number", ok: (i) => !i.scotland || filled(i.landlordRegistration) },
  { id: "agentLarn", label: "Letting agent registration number (LARN)", ok: (i) => !i.scotland || filled(i.agentLarn) },
];

/** Shown and counted, never blocking. */
export const RECOMMENDED: { id: RequirementId; label: string; ok: (i: RequirementInput) => boolean }[] = [
  { id: "highlights", label: `Key features (${MIN_FEATURES} or more)`, ok: (i) => i.highlights.filter((h) => h.trim()).length >= MIN_FEATURES },
  { id: "furnishing", label: "Furnishing", ok: (i) => filled(i.furnishing) },
  { id: "parking", label: "Parking", ok: (i) => filled(i.parking) },
  { id: "heating", label: "Heating", ok: (i) => filled(i.heating) },
  { id: "electricity", label: "Electricity", ok: (i) => filled(i.electricity) },
  { id: "water", label: "Water", ok: (i) => filled(i.water) },
  { id: "sewerage", label: "Sewerage", ok: (i) => filled(i.sewerage) },
  { id: "broadband", label: "Broadband", ok: (i) => filled(i.broadband) },
];

export function missing(input: RequirementInput) {
  return REQUIREMENTS.filter((r) => !r.ok(input));
}

export const isRequired = (id: string) => REQUIREMENTS.some((r) => r.id === id);

/** The check, from a listing as read (lib/listing-details), without importing it. */
export function inputFromDetails(d: {
  rent: number | null; deposit: number | null; availableFrom: string | null; beds: number | null; baths: number | null;
  propertyType: string | null; heading: string; body: string; highlights: string[]; images: unknown[];
  facts: Record<string, string | number | null | undefined>;
  epc?: { band: string | null };
  record?: { landlordRegistration: string | null; scotland: boolean; epc: { band: string | null } | null };
  agentLarn?: string | null;
}): RequirementInput {
  const f = (k: string) => (d.facts[k] == null ? null : String(d.facts[k]));
  return {
    rent: d.rent, deposit: d.deposit, availableFrom: d.availableFrom, beds: d.beds, baths: d.baths,
    propertyType: d.propertyType, heading: d.heading, body: d.body, highlights: d.highlights, photos: d.images.length,
    councilTaxBand: f("councilTaxBand"), parking: f("parking"), electricity: f("electricity"), water: f("water"),
    sewerage: f("sewerage"), broadband: f("broadband"), heating: f("heating"), furnishing: f("furnishing"),
    /* REX's band, else the property record's: the record is what the agent
       sees pre-filled, and saving sends it on. */
    epcBand: d.epc ? (d.epc.band ?? d.record?.epc?.band ?? null) : undefined,
    landlordRegistration: d.record?.landlordRegistration ?? null,
    agentLarn: d.agentLarn ?? null,
    scotland: d.record?.scotland ?? false,
  };
}
