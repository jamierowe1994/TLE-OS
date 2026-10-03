import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { patchOf, placeArea, savePatch } from "@/lib/chats";

/**
 * My Patch (3 Oct 2026): the town an agent works and its postcode area, set by
 * them in Profile, so colleagues can find their local agents. James chose
 * this over home addresses or GPS: an agent who has not set one simply does
 * not appear nearest.
 *   GET                       my patch, or null
 *   POST { town, area }       set it ("Northampton", "NN1" or "NN1 1AA")
 *   DELETE                    clear it
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: true, patch: null });
  const p = await patchOf(actor.id);
  return NextResponse.json({ ok: true, patch: p ? { town: p.town, area: p.area } : null });
}

export async function POST(req: NextRequest) {
  const { actor, viewingAs } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (viewingAs) return NextResponse.json({ ok: false, error: "You are viewing as someone else." }, { status: 423 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "Not on this environment." }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { town?: string; area?: string };
  const town = String(b.town ?? "").trim().slice(0, 40);
  if (!town) return NextResponse.json({ ok: false, error: "Which town do you work?" }, { status: 400 });
  const at = await placeArea(String(b.area ?? ""));
  if (!at) return NextResponse.json({ ok: false, error: "That postcode was not found. Try the first half, like NN1." }, { status: 400 });
  await savePatch(actor.id, { town, area: at.area, lat: at.lat, lng: at.lng });
  return NextResponse.json({ ok: true, patch: { town, area: at.area } });
}

export async function DELETE(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  await savePatch(actor.id, null);
  return NextResponse.json({ ok: true });
}
