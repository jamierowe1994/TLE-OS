import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { type Person } from "@/lib/rex-property-people";
import { homePeople } from "@/lib/home-people";
import { KIND_LABEL, peopleOn } from "@/lib/property-people";

/**
 * Who is on a home: the landlord, every sitting tenant, where it is, and
 * any access notes on file. Used by Report a repair, Plan a job and the
 * Compliance drawer - all three need the same answer, so it lives here
 * rather than under any one of them.
 *
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

  const { homeId, landlord, tenants, lat, lng, access, source } = await homePeople(id);

  /* The joint landlords and points of contact kept on the home (lib/property-people,
     16 Oct 2026), so whatever fills a landlord from here can offer them too. */
  const others = (await peopleOn(homeId).catch(() => [])).map((x) => ({ kind: x.kind, label: KIND_LABEL[x.kind], name: x.name, email: x.email ?? "", phone: x.phone ?? "", relation: x.relation }));

  return NextResponse.json({
    ok: true,
    landlord: shape(landlord),
    others,
    tenants: tenants.map((t) => ({ name: t.name, email: t.email, phone: t.phone, ...(t.room ? { room: t.room } : {}) })),
    /** Kept so anything still reading the old shape does not break. */
    tenant: shape(tenants[0] ?? null),
    lat,
    lng,
    access,
    source,
  });
}
