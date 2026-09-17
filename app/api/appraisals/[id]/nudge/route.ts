import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { getAppraisal } from "@/lib/appraisal-store";
import { NudgeRefused, sendContractNudge } from "@/lib/contract-nudge";
import { ResendBlocked } from "@/lib/resend";
import { publicOrigin } from "@/lib/origin";
import { assertNotViewingAs, ViewingAsRefused, VIEW_AS_COOKIE } from "@/lib/view-as";

/** POST - Nudge to sign, from the appraisal (James, 17 Sep 2026). See lib/contract-nudge. */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertNotViewingAs(req.cookies.get(VIEW_AS_COOKIE)?.value);
  } catch (e) {
    if (e instanceof ViewingAsRefused) return NextResponse.json({ ok: false, error: e.message }, { status: 423 });
    throw e;
  }
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  const me = userId ? await findUserById(userId) : null;
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const { id } = await ctx.params;
  const ma = await getAppraisal(id);
  if (!ma) return NextResponse.json({ ok: false, error: "No such appraisal." }, { status: 404 });
  try {
    const { to } = await sendContractNudge({ ma, origin: publicOrigin(req), by: me.name || me.email });
    return NextResponse.json({ ok: true, message: `Nudge sent to ${to}. The button takes them straight to their contract.` });
  } catch (e) {
    if (e instanceof NudgeRefused) return NextResponse.json({ ok: false, error: e.message }, { status: 409 });
    if (e instanceof ResendBlocked) return NextResponse.json({ ok: false, error: e.message }, { status: 503 });
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Couldn't send the nudge." }, { status: 500 });
  }
}
