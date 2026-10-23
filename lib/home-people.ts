import "server-only";
import { hasDb, q } from "@/lib/db";
import { managedBookFor } from "@/lib/managed-book-cache";
import { peopleForProperty, type Person } from "@/lib/rex-property-people";
import { addrOf, houseKeyOf, isRoomAddress, norm, parseAddress } from "@/lib/address-parse";
import { roomLabel } from "@/lib/houses";

/**
 * Who is on a home: the landlord, every sitting tenant (every room of a
 * shared house), where it is, and the access notes on file. The body of
 * /api/property/people, moved here on 23 Oct 2026 so a contractor's email
 * can ask the same question when the job itself holds no tenants (a job
 * taken on from the old system, or raised before the home was let).
 */
export type HomePeople = {
  homeId: string;
  landlord: Person | null;
  tenants: (Person & { room?: string })[];
  lat: number | null;
  lng: number | null;
  access: string;
  source: string;
};

export async function homePeople(id: string): Promise<HomePeople> {
  let landlord: Person | null = null;
  let tenants: (Person & { room?: string })[] = [];
  let lat: number | null = null;
  let lng: number | null = null;
  let source = "nothing on file";
  let homeId = id;

  try {
    const { book } = await managedBookFor(null);
    const p = book.properties.find((x) => x.propertyId === id || x.listingId === id);
    if (p) {
      if (p.propertyId) homeId = p.propertyId;
      landlord = p.landlord ? { contactId: p.landlord.contactId, name: p.landlord.name, email: p.landlord.email ?? "", phone: p.landlord.phone ?? "" } : null;
      tenants = p.tenants.map((t) => ({ contactId: t.contactId, name: t.name, email: t.email ?? "", phone: t.phone ?? "" }));
      /* A shared house (James, 8 Oct 2026): "especially if it's an HMO, we
         need to pull through every tenant under that property". REX lets each
         room as its own listing, so the house's other rooms - and the
         one-listing-per-let houses that repeat the same address - are read
         too, each tenant marked with their room. Flats share a house key but
         are separate homes, so only rooms and the house's own line join. */
      const here = addrOf(p);
      const key = houseKeyOf(here);
      const hereIsRoom = isRoomAddress(here);
      const siblings = book.properties.filter((x) => {
        if (x === p) return false;
        const there = addrOf(x);
        if (norm(there) === norm(here)) return true;
        if (!key || houseKeyOf(there) !== key) return false;
        return isRoomAddress(there) || (hereIsRoom && parseAddress(there).unit == null);
      });
      if (siblings.length) {
        const label = (x: { name: string; locality: string }) => (isRoomAddress(addrOf(x)) ? roomLabel(x) : undefined);
        tenants = tenants.map((t) => ({ ...t, room: label(p) }));
        for (const x of siblings) {
          for (const t of x.tenants) tenants.push({ contactId: t.contactId, name: t.name, email: t.email ?? "", phone: t.phone ?? "", room: label(x) });
        }
        /* The same person on two listings is one tenant. */
        const seen = new Set<string>();
        tenants = tenants.filter((t) => {
          const k = (t.email || t.contactId || t.name).toLowerCase();
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
      }
      lat = p.lat ?? null;
      lng = p.lng ?? null;
      if (landlord || tenants.length) source = "the managed book";
    }
  } catch {
    /* REX did not answer the book; the direct read below still might. */
  }

  /* Between tenancies, or on the market: the book has never heard of it. */
  if (!landlord && tenants.length === 0) {
    const direct = await peopleForProperty(id).catch(() => null);
    if (direct) {
      landlord = direct.landlord;
      tenants = direct.tenants;
      lat = lat ?? direct.lat;
      lng = lng ?? direct.lng;
      if (landlord || tenants.length) source = "REX";
    }
  }

  let access = "";
  if (hasDb()) {
    const [last] = await q<{ access: string }>(`SELECT access FROM os_works_orders WHERE property_id = $1 AND access <> '' ORDER BY created_at DESC LIMIT 1`, [id]).catch(() => []);
    access = last?.access ?? "";
    if (!access) {
      const notes = await q<{ body: string }>(`SELECT body FROM os_notes WHERE record_type = 'property' AND record_id = $1 AND body ILIKE '%access%' ORDER BY created_at DESC LIMIT 1`, [id]).catch(() => []);
      access = notes[0]?.body ?? "";
    }
  }

  return { homeId, landlord, tenants, lat, lng, access, source };
}
