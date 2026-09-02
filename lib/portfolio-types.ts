/**
 * The managed book, as the Portfolio screen sees it. Client-safe: types only.
 *
 * ── Where it comes from ───────────────────────────────────────────────────
 *
 * REX "leased" residential rentals. When a property lets, REX moves its
 * listing from "current" to "leased" and it stays there while we manage it —
 * so the leased book IS the managed book, and it is the one place the whole
 * business's stock exists with an address, a rent, a landlord and a
 * responsible agent on the same row.
 *
 * Measured 2 Sep 2026 against the live account: 449 leased rentals, every one
 * with coordinates, 447 with a rent, 328 with a landlord on the listing's
 * owner relationship, 321 with a sitting tenant on the tenant relationship,
 * 204 distinct landlords, 112 towns. Service type (Managed / Let Only / Rent
 * Collect) is set on 307 and blank on 142 — blank is shown as blank, not
 * guessed.
 *
 * PayProp is NOT used here. It holds the money side of the managed book, but
 * the UK agency has no API key on this environment (see lib/wiring.ts), so a
 * PayProp-driven portfolio would be Scotland's 84 properties presented as the
 * business. The rent roll below is REX's agreed rent, and says so.
 */

export interface Party {
  contactId: string;
  name: string;
  email: string | null;
  phone: string | null;
}

export interface ManagedProperty {
  listingId: string;
  /** REX property id — certificates hang off this, not the listing. */
  propertyId: string | null;
  /** "Flat 3, 12 High Street" — the headline. */
  name: string;
  /** "Filton BS34 7QA" — under the headline. */
  locality: string;
  /** REX's full one-line address, for search and the map card. */
  address: string;
  town: string | null;
  postcode: string | null;
  lat: number | null;
  lng: number | null;
  rent: number | null;
  rentPeriod: "month" | "week" | null;
  /** Monthly equivalent, for totals and sorting only. */
  rentMonthly: number | null;
  /** Managed / Let Only / Rent Collect, as REX has it. Null = not set in REX. */
  service: string | null;
  /** Long Term / Short Term. */
  letType: string | null;
  /** When REX moved it to leased — the let date, near enough. ISO date. */
  letSince: string | null;
  /** When the listing was created in REX. ISO date. */
  onBooksSince: string | null;
  agent: { id: string; name: string } | null;
  landlord: Party | null;
  tenants: Party[];
  image: string | null;
  images: string[];
  epcExpiry: string | null;
  epcRating: string | null;
}

export interface ManagedLandlord {
  contactId: string;
  name: string;
  email: string | null;
  phone: string | null;
  listingIds: string[];
  /** Monthly, across their properties. */
  rentRoll: number;
  /** e.g. { Managed: 2, "Let Only": 1 } */
  services: Record<string, number>;
}

export interface ManagedCounts {
  properties: number;
  /** Monthly rent across the book, from REX's agreed rent. */
  rentRoll: number;
  avgRent: number | null;
  landlords: number;
  /** Properties whose REX listing has no owner contact. */
  withoutLandlord: number;
  withTenant: number;
  byService: Record<string, number>;
  towns: number;
}

export interface ManagedBook {
  properties: ManagedProperty[];
  landlords: ManagedLandlord[];
  counts: ManagedCounts;
  pulledAt: string;
}
