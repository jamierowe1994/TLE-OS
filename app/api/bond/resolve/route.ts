import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { whoIs } from "@/lib/admin";
import { resolveAddress } from "@/lib/bond";

/**
 * POST { property_key } → pin the listing to one front door.
 * Up to forty register calls, sequential; allow a minute.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  if (!hasDb()) return NextResponse.json({ ok: false, error: "no database" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { property_key?: unknown };
  const key = typeof body.property_key === "string" ? body.property_key : "";
  if (!key) return NextResponse.json({ ok: false, error: "property_key is required." }, { status: 400 });
  const who = await whoIs(req);
  const actor = who.subject?.name || who.subject?.email || "someone";
  try {
    const r = await resolveAddress(key, actor);
    if (!r.ok) return NextResponse.json({ ok: false, error: r.reason }, { status: 422 });
    return NextResponse.json({ ok: true, prospect: r.prospect });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}
