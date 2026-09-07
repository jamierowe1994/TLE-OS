import "server-only";
import { rexCall, rexRows, rexConfigured } from "@/lib/rex";

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
    if (str((x.reln_type as Row | null)?.id) !== type) continue;
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
  const empty: PropertyPeople = { landlord: null, tenants: [], lat: null, lng: null };
  if (!rexConfigured() || !propertyId) return empty;

  const res = await rexCall("Listings", "search", {
    criteria: [{ name: "property_id", type: "=", value: propertyId }],
    limit: 20,
    order_by: { system_modtime: "desc" },
    extra_options: { extra_fields: ["related.contact_reln_listing"] },
  }).catch(() => null);
  if (!res?.ok) return empty;

  const rows = rexRows(res.result) as Row[];
  if (rows.length === 0) return empty;

  /* A leased listing first, then whatever REX touched most recently. */
  const leased = rows.filter((r) => /leased/i.test(str((r.system_listing_state as unknown) ?? "")));
  const ordered = [...leased, ...rows.filter((r) => !leased.includes(r))];

  const out: PropertyPeople = { ...empty };
  for (const r of ordered) {
    if (!out.landlord) out.landlord = partiesOf(r, "owner")[0] ?? null;
    if (out.tenants.length === 0) out.tenants = partiesOf(r, "purchtenant");
    if (out.lat == null) {
      const prop = (r.property ?? {}) as Row;
      out.lat = num(prop.adr_latitude ?? r.adr_latitude);
      out.lng = num(prop.adr_longitude ?? r.adr_longitude);
    }
    if (out.landlord && out.tenants.length) break;
  }
  return out;
}
