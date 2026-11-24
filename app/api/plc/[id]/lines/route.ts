import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { PlcRefused, setLine } from "@/lib/plc-store";
import { actorName, currentUser } from "@/lib/plc-actor";
import { can } from "@/lib/roles";

/**
 * POST /api/plc/<id>/lines  { lineId, v: "yes" | "no" | "na" | null }
 *
 * One of Susan's checklist lines (lib/plc PLC_LINES, her 4 Nov 2026 email):
 * yes, no, not applicable, or null to clear it. Working notes like the ticks:
 * nothing gates on them and nobody is told.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const me = await currentUser(req);
  const dryRun = process.env.NODE_ENV !== "production";
  if (!dryRun && !(me && can(me.role, "work:plc"))) {
    return NextResponse.json({ ok: false, error: "The checklist is for whoever works the PLC queue." }, { status: 403 });
  }
  let body: { lineId?: string; v?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected JSON." }, { status: 400 });
  }
  const lineId = typeof body.lineId === "string" ? body.lineId : "";
  const v = body.v;
  if (!lineId) return NextResponse.json({ ok: false, error: "Which line?" }, { status: 400 });
  if (v !== "yes" && v !== "no" && v !== "na" && v !== null) {
    return NextResponse.json({ ok: false, error: "Yes, no, N/A, or clear it." }, { status: 400 });
  }
  try {
    const updated = await setLine(id, lineId, v === null ? null : { v, by: await actorName(req, "Compliance"), at: new Date().toISOString() });
    return NextResponse.json({ ok: true, lines: updated.lines ?? {} });
  } catch (e) {
    const status = e instanceof PlcRefused ? 409 : 500;
    return NextResponse.json({ ok: false, error: publicError(e, "That didn't save.") }, { status });
  }
}
