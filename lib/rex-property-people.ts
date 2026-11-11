import "server-only";
import { rexCall, rexRows, rexConfigured } from "@/lib/rex";
import { relnKind } from "@/lib/rex-reln";
import { landlordsForListing } from "@/lib/landlords-for-home";

/**
 * Who is on a property, read from REX directly.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 *
 * The managed book (lib/managed-book) is the fast, cached source and the
 * right first stop - but it searches `system_listing_state = "leased"`, so a
 * home that is between tenancies or on the market right now is simply not in
 * it. James, 7 Sep 2026, typed 10 Richmond Avenue into Report a repair and
 * got nothing back: that home is on the compliance book and being marketed,
 * so the let book had never heard of it.
 *
 * A landlord still exists for that home, and a repair still has to be
 * reported against it. So when the book has nothing, we ask REX about that
 * one property instead of shrugging.
 *
 * Both sources read the same place - the listing's contact relationships,
 * `owner` for the landlord and `purchtenant` for the tenants - so the two
 * agree about what a landlord is.
 */

type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? "" : String(v)).trim();

export interface Person {
  contactId: string;
  name: string;
  email: string;
  phone: string;
}

export interface PropertyPeople {
  landlord: Person | null;
  /** Every landlord after the first (lib/landlords-for-home, 10 Nov 2026). */
  otherLandlords: Person[];
  tenants: Person[];
  lat: number | null;
  lng: number | null;
}

function person(c: Row | null | undefined): Person | null {
  if (!c) return null;
  const id = str(c.id);
  const name = str(c.name);
  if (!id || !name) return null;
  return { contactId: id, name, email: str(c.email_address), phone: str(c.phone_number) };
}

function partiesOf(listing: Row, type: string): Person[] {
  const related = (listing.related ?? {}) as Row;
  const relns = related.contact_reln_listing;
  if (!Array.isArray(relns)) return [];
  const out: Person[] = [];
  for (const x of relns as Row[]) {
    if (relnKind(x) !== type) continue;
    const p = person(x.contact as Row | null);
    if (p && !out.some((o) => o.contactId === p.contactId)) out.push(p);
  }
  return out;
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : null;
};

/**
 * Every listing REX holds for this property, newest first, with the people
 * on it. A let listing wins over a marketed one - the sitting tenant is the
 * person a repair is about.
 */
export async function peopleForProperty(propertyId: string): Promise<PropertyPeople> {
  const empty: PropertyPeople = { landlord: null, otherLandlords: [], tenants: [], lat: null, lng: null };
  if (!rexConfigured() || !propertyId) return empty;

  /* A home the OS took on itself ("pm-...") has no listings in REX to search;
     its landlords are still on its record and in the OS (below). */
  const rexHome = /^\d+$/.test(propertyId);
  const res = rexHome
    ? await rexCall("Listings", "search", {
        criteria: [{ name: "property_id", type: "=", value: propertyId }],
        limit: 20,
        order_by: { system_modtime: "desc" },
        extra_options: { extra_fields: ["related.contact_reln_listing"] },
      }).catch(() => null)
    : null;
  /* REX did not answer: nothing is assumed about who owns it. */
  if (rexHome && !res?.ok) return empty;

  const rows = (res ? rexRows(res.result) : []) as Row[];

  /* A leased listing first, then whatever REX touched most recently. */
  const leased = rows.filter((r) => /leased/i.test(str((r.system_listing_state as unknown) ?? "")));
  const ordered = [...leased, ...rows.filter((r) => !leased.includes(r))];

  const out: PropertyPeople = { ...empty };
  /* THE LANDLORDS, FROM THE ONE READER (10 Nov 2026). This took the first
     owner of the first listing REX named one on, so a repair or a certificate
     job on a home not yet let went to an owner the agent had since changed
     with Change landlord, and never to a second owner. The listing whose
     owners were read before is handed to lib/landlords-for-home, which lays
     the OS's own word over it (a changed landlord, the home's record, the
     joint landlords) and looks on the property itself when no listing names
     anybody. No more calls to REX than before, unless no listing has an owner. */
  const withOwner: Row = ordered.find((r) => partiesOf(r, "owner").length) ?? ordered[0] ?? {};
  const found = await landlordsForListing({ ...withOwner, property_id: withOwner.property_id ?? propertyId }, { listingId: str(withOwner.id) || null }).catch(() => null);
  const landlords = (found?.owners ?? []).map((c) => person(c)).filter((p): p is Person => Boolean(p));
  out.landlord = landlords[0] ?? null;
  out.otherLandlords = landlords.slice(1);
  for (const r of ordered) {
    /* Tenants only from a let listing (Sean McMahon, 4 Nov 2026, ticket
       7a042b50). On a listing still on the market, `purchtenant` is whoever
       was accepted onto it, not who lives there: Nicolas Gregg was accepted
       on 59 Fairley Street, failed referencing, stayed on the listing, and
       was sent notice of every viewing at the empty flat. */
    if (out.tenants.length === 0 && leased.includes(r)) out.tenants = partiesOf(r, "purchtenant");
    if (out.lat == null) {
      const prop = (r.property ?? {}) as Row;
      out.lat = num(prop.adr_latitude ?? r.adr_latitude);
      out.lng = num(prop.adr_longitude ?? r.adr_longitude);
    }
    if (out.tenants.length && out.lat != null) break;
  }
  return out;
}
