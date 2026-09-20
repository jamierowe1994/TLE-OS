/**
 * WHOSE ACCESS IS IT? The property's, not the listing's.
 *
 * James, 20 Sep 2026: "send the access stick to the property". How you get
 * into a house does not change because it was re-let - the keys are still in
 * the office, the tenant is still the person who opens the door - so the
 * arrangement is kept against the REX property and every listing on that
 * property reads the same one.
 *
 * A home REX has no property for (and a test file's pretend listing) has
 * nothing else to hang it on, so those keep the listing's own id. Records
 * written before this are moved across the first time the listing is opened
 * (components/ListingDrawer).
 */
export const accessKeyFor = (p: { listingId?: string | number | null; propertyId?: string | number | null }): string | null => {
  const property = p.propertyId != null && String(p.propertyId).trim() ? String(p.propertyId).trim() : null;
  if (property) return `property-${property}`;
  const listing = p.listingId != null && String(p.listingId).trim() ? String(p.listingId).trim() : null;
  return listing;
};
