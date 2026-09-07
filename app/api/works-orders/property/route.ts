import { NextRequest, NextResponse } from "next/server";
import { hasDb, q } from "@/lib/db";
import { whoIs } from "@/lib/admin";
import { managedBookFor } from "@/lib/managed-book-cache";
import { peopleForProperty, type Person } from "@/lib/rex-property-people";

/**
 * What the OS already knows about a home, for the report form: the
 * landlord's name, email and mobile, every sitting tenant with their name,
 * number and email, where it is, and any access notes on file.
 *
 * James, 7 Sep 2026: "once you fill in one detail... it should then pull
 * through the tenants' details... If there are multiple tenants, it should
 * have a dropdown to ask us which room it is that's reported it."
 *
 * TWO SOURCES, in this order:
 *
 *   1. The managed book - cached, instant, and right for a let home.
 *   2. REX itself, for that one property - slower, but it is the only thing
 *      that answers for a home between tenancies or on the market, which the
 *      book excludes because it searches leased listings only. That gap is
 *      what made this come back empty for 10 Richmond Avenue.
 *
 * Every tenant is returned, not the first: a shared house has several and
 * the form asks which of them reported it.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const shape = (p: Person | null) => (p ? { name: p.name, email: p.email, phone: p.phone } : null);

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "Which property?" }, { status: 400 });

  let landlord: Person | null = null;
  let tenants: Person[] = [];
  let lat: number | null = null;
  let lng: number | null = null;
  let source = "nothing on file";

  try {
    const { book } = await managedBookFor(null);
    const p = book.properties.find((x) => x.propertyId === id || x.listingId === id);
    if (p) {
      landlord = p.landlord ? { contactId: p.landlord.contactId, name: p.landlord.name, email: p.landlord.email ?? "", phone: p.landlord.phone ?? "" } : null;
      tenants = p.tenants.map((t) => ({ contactId: t.contactId, name: t.name, email: t.email ?? "", phone: t.phone ?? "" }));
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

  return NextResponse.json({
    ok: true,
    landlord: shape(landlord),
    tenants: tenants.map((t) => ({ name: t.name, email: t.email, phone: t.phone })),
    /** Kept so anything still reading the old shape does not break. */
    tenant: shape(tenants[0] ?? null),
    lat,
    lng,
    access,
    source,
  });
}
