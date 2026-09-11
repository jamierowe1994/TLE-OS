import type { Lead } from "@/lib/leads-sample";

/** The shape of what the OS holds on a lead beyond REX - safe for the browser. */
export interface PropertyFactsData {
  type: string;
  beds: number | null;
  baths: number | null;
  receptions: number | null;
  /** The address as placed, and where it is. */
  address: string | null;
  postcode: string | null;
  lat: number | null;
  lng: number | null;
  /** A REX property we are sure is this door, and its last photo. */
  rexPropertyId: string | null;
  image: string | null;
  /** How the property was found: an exact REX match, or a pin from the address. */
  matched: "rex" | "pin" | null;
  epc: string | null;
}

export const EMPTY_PROPERTY: PropertyFactsData = {
  type: "", beds: null, baths: null, receptions: null, address: null, postcode: null,
  lat: null, lng: null, rexPropertyId: null, image: null, matched: null, epc: null,
};

export interface LeadFacts {
  tags: string[] | null;
  property: PropertyFactsData | null;
}

/** The tags a lead starts with, before anyone touches them. */
export function defaultTags(l: Pick<Lead, "enquiry" | "area" | "source">): string[] {
  return [l.enquiry === "Landlord" ? "Landlord" : l.enquiry === "Valuation" ? "Valuation" : "Looking to rent", l.area, l.source]
    .filter((t) => t && t.trim() && t.trim() !== "—");
}

