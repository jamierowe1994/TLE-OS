import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { hasDb } from "@/lib/db";
import { whoIs } from "@/lib/admin";
import { getNudge, listNudges, updateNudge, type NudgeStatus } from "@/lib/bond-nudges";
import { maskContactFields, seesContactLists } from "@/lib/contact-mask";

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
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, reason: "Sign in first." }, { status: 401 });
  const p = req.nextUrl.searchParams;
  /* One landlord's number, for "Show number" (10 Oct 2026). The call list
     itself carries numbers shortened for an agent (lib/contact-mask), so the
     whole list of landlords is never one call; each one shown is a read the
     log records and the pace cap counts. */
  const one = Number(p.get("id"));
  if (one) {
    const nudge = await getNudge(one).catch(() => null);
    return nudge ? NextResponse.json({ ok: true, nudge }) : NextResponse.json({ ok: false, reason: "No such nudge." }, { status: 404 });
  }
  const districts = (p.get("districts") ?? "").split(",").map((d) => d.trim().toUpperCase()).filter(Boolean);
  const raw = p.get("status") ?? "open";
  const status = STATUSES.includes(raw as NudgeStatus) ? (raw as NudgeStatus | "all") : "open";
  try {
    const list = await listNudges({ districts, status });
    const full = seesContactLists(actor.role);
    return NextResponse.json({ ok: true, ...list, nudges: full ? list.nudges : list.nudges.map((n) => maskContactFields(n)) });
  } catch (e) {
    return NextResponse.json({ ok: false, reason: publicError(e) }, { status: 502 });
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
    return NextResponse.json({ ok: false, error: publicError(e) }, { status: 400 });
  }
}
