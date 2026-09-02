import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { whoIs } from "@/lib/admin";
import { addByHand, dossier, findCandidates, removeByHand } from "@/lib/property-lookup";

/**
 * Look up any door, and put one on the list by hand.
 *
 * GET  ?q=…        → candidate addresses from the register
 * GET  ?hs_id=…    → the dossier for one door
 * POST { hs_id, reason }        → add it to the board with the reason
 * POST { property_key, remove } → take a hand-added door off
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const hsId = (p.get("hs_id") ?? "").trim();
  try {
    if (hsId) {
      const d = await dossier(hsId);
      if (!d) return NextResponse.json({ ok: false, error: "The register has no record of that door." }, { status: 404 });
      return NextResponse.json({ ok: true, dossier: d });
    }
    const r = await findCandidates(p.get("q") ?? "");
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  if (!hasDb()) return NextResponse.json({ ok: false, error: "no database" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const who = await whoIs(req);
  const actor = who.subject?.name || who.subject?.email || "someone";
  if (body.remove && typeof body.property_key === "string") {
    const r = await removeByHand(body.property_key, actor);
    return NextResponse.json(r.ok ? { ok: true, prospect: r.prospect } : { ok: false, error: "No such property." }, { status: r.ok ? 200 : 404 });
  }
  const hsId = typeof body.hs_id === "string" ? body.hs_id.trim() : "";
  if (!hsId) return NextResponse.json({ ok: false, error: "hs_id is required." }, { status: 400 });
  const r = await addByHand(hsId, actor, String(body.reason ?? ""));
  if (!r.ok) return NextResponse.json({ ok: false, error: r.reason }, { status: 400 });
  return NextResponse.json({ ok: true, prospect: r.prospect });
}
