import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { type Person } from "@/lib/rex-property-people";
import { homePeople } from "@/lib/home-people";
import { KIND_LABEL } from "@/lib/property-people";
import { peopleOnHome } from "@/lib/home-aliases";

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

  const { homeId, landlord, otherLandlords, tenants, lat, lng, access, source } = await homePeople(id);

  /* The joint landlords and points of contact kept on the home (lib/property-people,
     16 Oct 2026), so whatever fills a landlord from here can offer them too.
     Under every key the home is filed under, not the one (lib/home-aliases,
     4 Nov 2026), with the listing's other owners first, as the Propoly push
     orders them; each person once, and never the landlord again. */
  const key = (v: string | null | undefined) => (v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const seen = new Set([landlord && key(landlord.email) && `e:${key(landlord.email)}`, landlord && key(landlord.name) && `n:${key(landlord.name)}`].filter((k): k is string => Boolean(k)));
  const others = [
    ...otherLandlords.filter((l) => /^\d+$/.test(l.contactId)).map((l) => ({ kind: "joint_landlord" as const, name: l.name, email: l.email, phone: l.phone, relation: "" })),
    ...(await peopleOnHome(homeId).catch(() => [])).map((x) => ({ kind: x.kind, name: x.name, email: x.email ?? "", phone: x.phone ?? "", relation: x.relation })),
  ]
    .filter((x) => {
      /* The same email or the same name is the same person, as the push reads them. */
      const ids = [key(x.email) && `e:${key(x.email)}`, key(x.name) && `n:${key(x.name)}`].filter((k): k is string => Boolean(k));
      if (ids.some((k) => seen.has(k))) return false;
      ids.forEach((k) => seen.add(k));
      return true;
    })
    .map((x) => ({ ...x, label: KIND_LABEL[x.kind] }));

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
