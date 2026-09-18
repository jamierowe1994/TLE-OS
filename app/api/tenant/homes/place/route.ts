import { NextRequest, NextResponse } from "next/server";
import { currentTenant } from "@/lib/tenant-account";
import { originFromText } from "@/lib/tenant-find";

/** A postcode or town typed on Find a home, placed on the map. Signed-in
 *  tenants only: each new place is a paid geocode. */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const me = await currentTenant();
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const at = await originFromText(req.nextUrl.searchParams.get("q") ?? "");
  if (!at) return NextResponse.json({ ok: false, error: "We couldn't find that place. Try a postcode." }, { status: 404 });
  return NextResponse.json({ ok: true, at });
}
