/**
 * The order the Listings board was in when a listing was opened, kept for
 * the tab, so ‹ › on the listing's own page steps through the same filtered,
 * sorted board the agent was looking at. Portfolio's lib/portfolio-order,
 * for listings.
 */
export const LISTING_ORDER_KEY = "listings:order";

export function rememberListingOrder(listingIds: string[]): void {
  try {
    sessionStorage.setItem(LISTING_ORDER_KEY, JSON.stringify(listingIds));
  } catch {
    /* private mode: the arrows just don't show */
  }
}

export function listingOrder(): string[] {
  try {
    const o = JSON.parse(sessionStorage.getItem(LISTING_ORDER_KEY) ?? "[]");
    return Array.isArray(o) ? o.map(String) : [];
  } catch {
    return [];
  }
}
