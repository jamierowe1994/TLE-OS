import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { whoIs } from "@/lib/admin";
import { ownerLookups, ownerProvider, requestOwner } from "@/lib/bond";

/**
 * GET  → the lookups so far and whether the Land Registry is connected.
 * POST { property_key } → order one. Refuses, plainly, until a provider is wired.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  if (!hasDb()) return NextResponse.json({ ok: false, reason: "no database" }, { status: 503 });
  return NextResponse.json({ ok: true, provider: ownerProvider(), lookups: await ownerLookups() });
}

export async function POST(req: NextRequest) {
  if (!hasDb()) return NextResponse.json({ ok: false, error: "no database" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { property_key?: unknown };
  const key = typeof body.property_key === "string" ? body.property_key : "";
  if (!key) return NextResponse.json({ ok: false, error: "property_key is required." }, { status: 400 });
  const who = await whoIs(req);
  const actor = who.subject?.name || who.subject?.email || "someone";
  const r = await requestOwner(key, actor);
  return NextResponse.json(
    r.ok ? { ok: true, provider: r.provider } : { ok: false, error: r.reason, provider: r.provider },
    { status: r.ok ? 200 : 409 }
  );
}
