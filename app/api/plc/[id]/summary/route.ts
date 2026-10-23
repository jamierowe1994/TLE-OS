import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { getCase, saveAiSummary } from "@/lib/plc-store";
import { currentUser } from "@/lib/plc-actor";
import { can } from "@/lib/roles";
import { freshSummary, writeSummary } from "@/lib/plc-summary";
import { isTestCase } from "@/lib/test-guard";
import { AiUnavailable } from "@/lib/ai-outage";

/**
 * GET  /api/plc/<id>/summary → the AI summary at the top of the pack, written
 *                              now if there is none for the pack as it stands
 * POST /api/plc/<id>/summary → write it again, whatever is kept
 *
 * Its own read, like the tenants' answers: it is a model call of several
 * seconds, and the pack itself must never wait on it. The screen shows it
 * loading, and a pack the scan has not read yet has nothing to summarise.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

async function answer(req: NextRequest, ctx: Ctx, force: boolean) {
  const { id } = await ctx.params;
  const me = await currentUser(req);
  const dryRun = process.env.NODE_ENV !== "production";
  if (!dryRun && !(me && can(me.role, "work:plc"))) {
    return NextResponse.json({ ok: false, error: "The summary is for whoever works the PLC queue." }, { status: 403 });
  }
  const c = await getCase(id);
  if (!c) return NextResponse.json({ ok: false, error: "No handover with that reference." }, { status: 404 });
  if (!c.scannedAt) {
    return NextResponse.json({ ok: true, summary: null, why: "The pack hasn't been read yet." });
  }
  const kept = force ? null : freshSummary(c);
  if (kept) return NextResponse.json({ ok: true, summary: kept });
  try {
    const summary = await writeSummary(c);
    /* A test let's summary is shown, not kept: test packs are walked again and again. */
    if (!isTestCase(c)) await saveAiSummary(id, summary);
    return NextResponse.json({ ok: true, summary });
  } catch (e) {
    /* Claude's refusals come as one plain sentence (lib/ai-outage). Anything
       else is ours or the SDK's, and its words are not for the screen. */
    if (!(e instanceof AiUnavailable)) console.error("[plc-summary]", id, e);
    const error = e instanceof AiUnavailable ? e.message : publicError(e instanceof Error && /^The summary/.test(e.message) ? e : null, "Couldn't write the summary just now. The scan's lines are below.");
    return NextResponse.json({ ok: false, error }, { status: 502 });
  }
}

export async function GET(req: NextRequest, ctx: Ctx) {
  return answer(req, ctx, false);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  return answer(req, ctx, true);
}
