import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { listProspects, radarSummary, updateProspect } from "@/lib/radar";

/**
 * The Radar board's feed.
 *
 * GET   → every flagged property, strongest first, with the summary the
 *         header reads. No database is an ERROR STATE, never a sample list:
 *         the live-figures rule. The board says what is wrong.
 * PATCH → { property_key, stage?, assigned_to?, notes? }. The human side of a
 *         prospect; signals and score are never written from here.
 *
 * Pages and APIs under /api are behind the session in middleware, so there is
 * no second gate here — the same arrangement as /api/leads.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  if (!hasDb()) {
    return NextResponse.json(
      { ok: false, live: false, reason: "Radar needs the database and this environment has none." },
      { status: 503 }
    );
  }
  try {
    const [prospects, summary] = await Promise.all([listProspects(), radarSummary()]);
    return NextResponse.json({ ok: true, live: true, prospects, summary });
  } catch (e) {
    return NextResponse.json({ ok: false, live: false, reason: (e as Error).message }, { status: 502 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!hasDb()) {
    return NextResponse.json({ ok: false, error: "no database" }, { status: 503 });
  }
  let body: { property_key?: unknown; stage?: unknown; assigned_to?: unknown; notes?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Send JSON." }, { status: 400 });
  }
  const key = typeof body.property_key === "string" ? body.property_key : "";
  if (!key) return NextResponse.json({ ok: false, error: "property_key is required." }, { status: 400 });
  try {
    const prospect = await updateProspect(key, {
      stage: body.stage,
      assigned_to: body.assigned_to,
      notes: body.notes,
    });
    if (!prospect) return NextResponse.json({ ok: false, error: "No such prospect." }, { status: 404 });
    return NextResponse.json({ ok: true, prospect });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
