import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { whoIs } from "@/lib/admin";
import { logActivity } from "@/lib/bond";
import { getLandlord, listLandlords, updateLandlord } from "@/lib/landlords";

/**
 * Landlords: the list, one profile, and the human fields.
 *
 * GET  ?districts=NN1,NN2  → landlords with a door in those districts (all when absent)
 * GET  ?key=co:12345678    → one landlord with their doors
 * PATCH { key, marketing_status?, linkedin_url?, notes? }
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!hasDb()) return NextResponse.json({ ok: false, reason: "Bond needs the database and this environment has none." }, { status: 503 });
  const p = req.nextUrl.searchParams;
  const key = p.get("key");
  try {
    if (key) {
      const r = await getLandlord(key);
      if (!r) return NextResponse.json({ ok: false, reason: "No such landlord." }, { status: 404 });
      return NextResponse.json({ ok: true, ...r });
    }
    const districts = (p.get("districts") ?? "").split(",").map((d) => d.trim().toUpperCase()).filter(Boolean);
    return NextResponse.json({ ok: true, landlords: await listLandlords({ districts }) });
  } catch (e) {
    return NextResponse.json({ ok: false, reason: (e as Error).message }, { status: 502 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!hasDb()) return NextResponse.json({ ok: false, error: "no database" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const key = typeof body.key === "string" ? body.key : "";
  if (!key) return NextResponse.json({ ok: false, error: "key is required." }, { status: 400 });
  try {
    const before = await getLandlord(key);
    const landlord = await updateLandlord(key, { marketing_status: body.marketing_status, linkedin_url: body.linkedin_url, notes: body.notes });
    if (!landlord) return NextResponse.json({ ok: false, error: "No such landlord." }, { status: 404 });
    const who = await whoIs(req);
    const actor = who.subject?.name || who.subject?.email || "someone";
    if (before && body.marketing_status !== undefined && before.landlord.marketing_status !== landlord.marketing_status) {
      await logActivity({
        actor,
        kind: "stage",
        address: landlord.name,
        detail: landlord.marketing_status === "do_not_send" ? "Marked Do not send" : "Marketing switched back on",
      });
    }
    return NextResponse.json({ ok: true, landlord });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
