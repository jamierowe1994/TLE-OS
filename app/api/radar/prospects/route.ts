import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { getProspect, listProspects, radarSummary, updateProspect } from "@/lib/radar";
import { whoIs } from "@/lib/admin";
import { logActivity } from "@/lib/bond";
import { STAGE_LABEL, isStage } from "@/lib/radar-signals";

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
    const before = await getProspect(key);
    const prospect = await updateProspect(key, {
      stage: body.stage,
      assigned_to: body.assigned_to,
      notes: body.notes,
    });
    if (!prospect) return NextResponse.json({ ok: false, error: "No such prospect." }, { status: 404 });

    /* The Today feed in Bond. One line per thing that actually changed. */
    const who = await whoIs(req);
    const actor = who.subject?.name || who.subject?.email || "someone";
    const address = prospect.address || prospect.street || prospect.postcode;
    if (before && isStage(body.stage) && body.stage !== before.stage) {
      await logActivity({
        actor,
        kind: body.stage === "appraisal_booked" ? "appraisal" : "stage",
        property_key: key,
        address,
        detail: body.stage === "appraisal_booked" ? "Appraisal booked" : `Moved to ${STAGE_LABEL[body.stage]}`,
      });
    }
    if (before && body.assigned_to !== undefined && (prospect.assigned_to ?? "") !== (before.assigned_to ?? "")) {
      await logActivity({ actor, kind: "assigned", property_key: key, address, detail: prospect.assigned_to ? `Assigned to ${prospect.assigned_to}` : "Unassigned" });
    }
    if (before && body.notes !== undefined && prospect.notes !== before.notes && prospect.notes.trim()) {
      await logActivity({ actor, kind: "note", property_key: key, address, detail: prospect.notes.trim().slice(0, 160) });
    }
    return NextResponse.json({ ok: true, prospect });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
