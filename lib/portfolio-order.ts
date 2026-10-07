/**
 * The order the Portfolio list was in when a home was opened, kept for the
 * tab, so ‹ › on the property's own page steps through the same filtered,
 * sorted list the agent was looking at.
 */
export const ORDER_KEY = "portfolio:order";

export function rememberOrder(listingIds: string[]): void {
  try {
    sessionStorage.setItem(ORDER_KEY, JSON.stringify(listingIds));
  } catch {
    /* private mode: the arrows just don't show */
  }
}
