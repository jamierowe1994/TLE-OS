import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { getCase, PlcRefused, setTick } from "@/lib/plc-store";
import { checkById, type CheckId } from "@/lib/plc";
import { actorName, currentUser } from "@/lib/plc-actor";
import { can } from "@/lib/roles";

/**
 * POST /api/plc/<id>/ticks  { checkId, ok: true | false | null }
 *
 * One line of Kirstie's checklist on the review screen (James, 23 Oct 2026).
 * Yes, no, or null to clear it. The tick records the files on the check as
 * they are now (PlcTick.keys), so a file swapped later un-ticks itself.
 *
 * Her working notes, not a decision: nothing gates on them, and nobody is told.
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

  let body: { checkId?: string; ok?: boolean | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected JSON." }, { status: 400 });
  }
  const checkId = body.checkId as CheckId | undefined;
  if (!checkId || !checkById(checkId)) {
    return NextResponse.json({ ok: false, error: "Which check?" }, { status: 400 });
  }
  if (body.ok !== true && body.ok !== false && body.ok !== null) {
    return NextResponse.json({ ok: false, error: "Yes, no, or clear it." }, { status: 400 });
  }

  try {
    const c = await getCase(id);
    if (!c) return NextResponse.json({ ok: false, error: "No handover with that reference." }, { status: 404 });
    const keys = c.documents.filter((d) => d.checkId === checkId || d.covers?.includes(checkId)).map((d) => d.key);
    const updated = await setTick(
      id,
      checkId,
      body.ok === null ? null : { ok: body.ok, by: await actorName(req, "Compliance"), at: new Date().toISOString(), keys }
    );
    return NextResponse.json({ ok: true, ticks: updated.ticks ?? {} });
  } catch (e) {
    const status = e instanceof PlcRefused ? 409 : 500;
    return NextResponse.json({ ok: false, error: publicError(e, "That didn't save.") }, { status });
  }
}
