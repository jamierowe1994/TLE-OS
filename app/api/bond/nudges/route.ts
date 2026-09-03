import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { whoIs } from "@/lib/admin";
import { listNudges, updateNudge, type NudgeStatus } from "@/lib/bond-nudges";

/**
 * The call list.
 *
 * GET   ?districts=NN1,NN2&status=open|snoozed|done|dismissed|gone|all
 * PATCH { id, status?, snooze_days?, notes? }
 *
 * Reads and works the list. The REX read behind it is its own route
 * (nudges-sync) because it takes minutes.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STATUSES: Array<NudgeStatus | "all"> = ["open", "snoozed", "done", "dismissed", "gone", "all"];

export async function GET(req: NextRequest) {
  if (!hasDb()) return NextResponse.json({ ok: false, reason: "Bond needs the database and this environment has none." }, { status: 503 });
  const p = req.nextUrl.searchParams;
  const districts = (p.get("districts") ?? "").split(",").map((d) => d.trim().toUpperCase()).filter(Boolean);
  const raw = p.get("status") ?? "open";
  const status = STATUSES.includes(raw as NudgeStatus) ? (raw as NudgeStatus | "all") : "open";
  try {
    return NextResponse.json({ ok: true, ...(await listNudges({ districts, status })) });
  } catch (e) {
    return NextResponse.json({ ok: false, reason: (e as Error).message }, { status: 502 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!hasDb()) return NextResponse.json({ ok: false, error: "no database" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = Number(body.id);
  if (!Number.isFinite(id)) return NextResponse.json({ ok: false, error: "id is required." }, { status: 400 });
  const who = await whoIs(req);
  const actor = who.subject?.name || who.subject?.email || "someone";
  try {
    const nudge = await updateNudge(id, actor, { status: body.status, notes: body.notes, snooze_days: body.snooze_days });
    if (!nudge) return NextResponse.json({ ok: false, error: "No such nudge." }, { status: 404 });
    return NextResponse.json({ ok: true, nudge });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
