import "server-only";
import { bookFor } from "@/lib/listings-cache";
import { managedBookFor } from "@/lib/managed-book-cache";
import { getListingContacts, type ListingContact } from "@/lib/business/rex-stats";
import { landlordForListing } from "@/lib/rex-landlord";
import { peopleOnHome } from "@/lib/home-aliases";
import type { PropertyPerson } from "@/lib/property-people";
import type { OsListing } from "@/lib/rex-listings";
import type { ManagedProperty } from "@/lib/portfolio-types";

/**
 * IS THIS LISTING ON THEIR BOOK, FOR STEVE.
 *
 * Their book is two things: the listings they are marketing (bookFor) and the
 * homes of theirs we look after, which is Portfolio (managedBookFor). Steve
 * only checked the first, so a let home in an agent's own Portfolio came back
 * "isn't on your book" and with no landlord (Lorna, 2 Nov 2026: 44 Rosedale
 * Grove, rent collect, moved in 30 Oct, landlord on the record). The same
 * rule the screens apply: a home that opens on their Portfolio is theirs.
 */
export async function onTheirBook(
  rexUserId: string | null,
  listingId: string
): Promise<{ listing: OsListing | null; home: ManagedProperty | null; propertyId: string | null; address: string | null }> {
  const id = String(listingId);
  const listing = (await bookFor(rexUserId)).listings.find((l) => String(l.id) === id) ?? null;
  if (listing) return { listing, home: null, propertyId: listing.propertyId ? String(listing.propertyId) : null, address: `${listing.name}, ${listing.locality}` };
  const managed = await managedBookFor(rexUserId).catch(() => null);
  const home = managed?.book.properties.find((p) => String(p.listingId) === id) ?? null;
  return { listing: null, home, propertyId: home?.propertyId ?? null, address: home ? `${home.name}, ${home.locality}` : null };
}

export type HomeContact = {
  /** REX's contact id, or the OS's own ("changed:", "record:", "person:"...). */
  id: string;
  name: string;
  /** In words, for Steve to repeat: "Landlord", "Tenant", "Point of contact (Partner)". */
  role: string;
  kind: "landlord" | "tenant" | "contact" | "other";
  email: string | null;
  phone: string | null;
};

/**
 * WHO IS ON A HOME, FOR STEVE (4 Nov 2026).
 *
 * Steve took REX's contacts on the listing whenever REX named anybody, so a
 * landlord changed in the OS, a joint landlord, a point of contact and the
 * tenants set with Edit on the home never reached what he said - nor the
 * email he addressed, which went to REX's owner. Now the answer the screens
 * give, in the order the Propoly push sends landlords:
 *
 *   a home in Portfolio  its landlords and tenants as the book has them
 *                        (lib/book-lets: every landlord, the tenants as put
 *                        right on the home and on the let)
 *   a listing            its landlord as the listing has it (lib/rex-landlord
 *                        landlordForListing, the newest change in the OS
 *                        first), then REX's other owners - none once the
 *                        landlord was changed - and REX's tenant
 *
 * and for both, the joint landlords and points of contact kept on the home
 * under every key it is filed under (lib/home-aliases), then anybody else REX
 * relates to the listing. Each person once, by email, else by name. Empty
 * means nothing could be read, never that the home has nobody.
 */
export async function homeContacts(listingId: string, at: { home: ManagedProperty | null; propertyId: string | null }): Promise<HomeContact[]> {
  const [rex, onHome] = await Promise.all([
    getListingContacts(listingId).catch(() => [] as ListingContact[]),
    peopleOnHome(at.propertyId, `listing:${listingId}`).catch(() => [] as PropertyPerson[]),
  ]);
  const out: HomeContact[] = [];
  const key = (v: string | null | undefined) => (v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const seen = new Set<string>();
  const add = (c: HomeContact) => {
    const ids = [key(c.email) && `${c.kind}:e:${key(c.email)}`, key(c.name) && `${c.kind}:n:${key(c.name)}`].filter((k): k is string => Boolean(k));
    if (ids.some((k) => seen.has(k))) return;
    ids.forEach((k) => seen.add(k));
    /* The first landlord is the landlord; the rest are joint, as on the let. */
    out.push(c.kind === "landlord" && out.some((x) => x.kind === "landlord") ? { ...c, role: "Joint landlord" } : c);
  };
  const fromRex = (c: ListingContact, kind: HomeContact["kind"], role: string) => ({ id: c.id, name: c.name, role, kind, email: c.email, phone: c.phone });

  if (at.home) {
    for (const l of [at.home.landlord, ...(at.home.otherLandlords ?? [])]) if (l) add({ id: l.contactId, name: l.name, role: "Landlord", kind: "landlord", email: l.email, phone: l.phone });
  } else {
    const ll = await landlordForListing(listingId).catch(() => null);
    /* Everybody the one reader finds (lib/landlords-for-home): a landlord
       changed in the OS stands in for REX's owners, so those are not added. */
    for (const l of ll?.ok ? ll.landlords : []) add({ id: l.contactId ?? l.key, name: l.name, role: "Landlord", kind: "landlord", email: l.email, phone: l.phone });
  }
  for (const p of onHome.filter((x) => x.kind === "joint_landlord")) add({ id: `person:${p.id}`, name: p.name, role: "Landlord", kind: "landlord", email: p.email, phone: p.phone });
  if (at.home) for (const t of at.home.tenants) add({ id: t.contactId, name: t.name, role: "Tenant", kind: "tenant", email: t.email, phone: t.phone });
  else for (const c of rex.filter((x) => x.kind === "purchtenant")) add(fromRex(c, "tenant", c.role ?? "Tenant"));
  for (const p of onHome.filter((x) => x.kind === "contact")) add({ id: `person:${p.id}`, name: p.name, role: p.relation ? `Point of contact (${p.relation})` : "Point of contact", kind: "contact", email: p.email, phone: p.phone });
  for (const c of rex.filter((x) => x.kind !== "owner" && x.kind !== "purchtenant")) add(fromRex(c, "other", c.role ?? "Other"));
  return out;
}
