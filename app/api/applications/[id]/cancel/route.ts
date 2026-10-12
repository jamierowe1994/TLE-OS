import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { assertNotViewingAs, ViewingAsRefused, VIEW_AS_COOKIE } from "@/lib/view-as";
import { letPeople } from "@/lib/let-people";
import { CANCEL_REASONS, CANCEL_WORDS, cancelLet, cancellationFor } from "@/lib/let-cancel";
import { markApplicationsFiled } from "@/lib/applications-board";

/**
 * POST { reason, note, confirm } → cancel the let (lib/let-cancel). The
 * reason is one of CANCEL_REASONS, and `confirm` must be exactly "Cancel
 * deal" - checked here too, so nobody cancels a let by a stray click (James,
 * 12 Oct 2026). Recorded in the OS and put on Kirstie's feed; REX and
 * Propoly are not touched.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertNotViewingAs(req.cookies.get(VIEW_AS_COOKIE)?.value);
  } catch (e) {
    if (e instanceof ViewingAsRefused) return NextResponse.json({ ok: false, error: e.message }, { status: 423 });
    throw e;
  }
  const { id } = await ctx.params;
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { reason?: string; note?: string; confirm?: string };
  const reason = (body.reason ?? "").trim();
  const note = (body.note ?? "").trim().slice(0, 1000);
  if (!(CANCEL_REASONS as readonly string[]).includes(reason)) return NextResponse.json({ ok: false, error: "Pick why it's being cancelled." }, { status: 400 });
  if (reason === "Something else" && !note) return NextResponse.json({ ok: false, error: "Say what happened." }, { status: 400 });
  if ((body.confirm ?? "").trim().toLowerCase() !== CANCEL_WORDS.toLowerCase()) {
    return NextResponse.json({ ok: false, error: `Type "${CANCEL_WORDS}" to cancel it.` }, { status: 400 });
  }
  if (await cancellationFor(id)) return NextResponse.json({ ok: false, error: "This let is already cancelled." }, { status: 409 });

  const r = await letPeople(id, actor);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
  try {
    const cancelled = await cancelLet({
      ref: id,
      dealId: r.let.dealId,
      property: r.let.property,
      reason,
      note,
      by: { name: actor.name || actor.email, email: actor.email },
      agent: { name: r.let.agentName, email: null },
    });
    /* Off Applications now, not when the held board next rebuilds. */
    markApplicationsFiled();
    return NextResponse.json({ ok: true, cancelled });
  } catch {
    return NextResponse.json({ ok: false, error: "That didn't save. Nothing has been cancelled." }, { status: 503 });
  }
}
