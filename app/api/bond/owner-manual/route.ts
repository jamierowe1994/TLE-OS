import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { whoIs } from "@/lib/admin";
import { OWNER_SOURCES, recordOwner } from "@/lib/bond";

/** POST { property_key, name, address, source, title_number?, note? } → the owner, recorded by hand. */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ ok: true, sources: OWNER_SOURCES });
}

export async function POST(req: NextRequest) {
  if (!hasDb()) return NextResponse.json({ ok: false, error: "no database" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const key = typeof body.property_key === "string" ? body.property_key : "";
  if (!key) return NextResponse.json({ ok: false, error: "property_key is required." }, { status: 400 });
  const who = await whoIs(req);
  const actor = who.subject?.name || who.subject?.email || "someone";
  const r = await recordOwner(key, actor, {
    name: body.name,
    address: body.address,
    source: body.source,
    title_number: body.title_number,
    note: body.note,
  });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.reason }, { status: 400 });
  return NextResponse.json({ ok: true, prospect: r.prospect });
}
