/**
 * The order the Applications board or list was in when a let was opened,
 * kept for the tab, so ‹ › on the let's own page steps through the same
 * lets. lib/listing-order, for applications.
 */
const KEY = "applications:order";

export function rememberApplicationOrder(ids: string[]): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    /* private mode: the arrows just don't show */
  }
}

export function applicationOrder(): string[] {
  try {
    const o = JSON.parse(sessionStorage.getItem(KEY) ?? "[]");
    return Array.isArray(o) ? o.map(String) : [];
  } catch {
    return [];
  }
}
