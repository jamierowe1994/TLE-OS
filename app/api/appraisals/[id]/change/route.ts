import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { cancelAppraisal, rearrangeAppraisal } from "@/lib/appraisal-change";
import { withLiveStages } from "@/lib/appraisal-stage";
import { publicOrigin } from "@/lib/origin";
import { assertNotViewingAs, ViewingAsRefused, VIEW_AS_COOKIE } from "@/lib/view-as";

/**
 * POST → cancel or rearrange a market appraisal (lib/appraisal-change,
 * James, 15 Oct 2026).
 *
 *   { action: "cancel" }
 *   { action: "move", startsAt, minutes? }
 *
 * ok is what happened, not that the request arrived: anything that did not
 * go through comes back 409 with the reason in `said`. Emails are never sent
 * here - the landlord's are offered on screen (/api/confirmations).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertNotViewingAs(req.cookies.get(VIEW_AS_COOKIE)?.value);
  } catch (e) {
    if (e instanceof ViewingAsRefused) return NextResponse.json({ ok: false, said: e.message }, { status: 423 });
    throw e;
  }
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, said: "Sign in first." }, { status: 401 });

  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as { action?: string; startsAt?: string; minutes?: number };
  if (b.action !== "cancel" && b.action !== "move") {
    return NextResponse.json({ ok: false, said: "Cancel or rearrange?" }, { status: 400 });
  }
  if (b.action === "move" && !b.startsAt) {
    return NextResponse.json({ ok: false, said: "Pick the new day and time first." }, { status: 400 });
  }
  const out =
    b.action === "cancel"
      ? await cancelAppraisal(actor, decodeURIComponent(id))
      : await rearrangeAppraisal(actor, decodeURIComponent(id), String(b.startsAt), publicOrigin(req), Number(b.minutes) || 60);
  /* The file reads the record back with its live stage. */
  const appraisal = out.appraisal ? (await withLiveStages([out.appraisal], new Date(), { fresh: true }).catch(() => [out.appraisal]))[0] : null;
  return NextResponse.json({ ...out, appraisal }, { status: out.ok ? 200 : 409 });
}
