import { NextRequest, NextResponse } from "next/server";
import { currentTenant } from "@/lib/tenant-account";
import { saveAlert, stopAlert } from "@/lib/tenant-find";

/**
 * New-home alerts. Saved only with `consent: true` - the tenant ticking the
 * box that says they are happy to get the emails. There is no other way in.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const int = (v: unknown, max: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 && n <= max ? n : null;
};
const coord = (v: unknown, lim: number) => {
  const n = Number(v);
  return v != null && Number.isFinite(n) && Math.abs(n) <= lim ? n : null;
};

export async function POST(req: NextRequest) {
  const me = await currentTenant();
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (b.consent !== true) return NextResponse.json({ ok: false, error: "Tick the box to say you're happy to get the emails." }, { status: 400 });
  await saveAlert(me.email, me.name, {
    place: typeof b.place === "string" ? b.place.slice(0, 80) : null,
    lat: coord(b.lat, 90),
    lng: coord(b.lng, 180),
    radiusMiles: int(b.radiusMiles, 100),
    minBeds: int(b.minBeds, 10),
    maxRent: int(b.maxRent, 50000),
    type: b.type === "house" || b.type === "flat" ? b.type : null,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const me = await currentTenant();
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  await stopAlert(me.email);
  return NextResponse.json({ ok: true });
}
