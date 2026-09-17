import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { getAppraisal } from "@/lib/appraisal-store";
import { markThreadRead, replyAsAgent, threadFor } from "@/lib/appraisal-messages";
import { publicOrigin } from "@/lib/origin";
import { assertNotViewingAs, ViewingAsRefused, VIEW_AS_COOKIE } from "@/lib/view-as";

/**
 * The landlord conversation on one appraisal (17 Sep 2026).
 *   GET  ?read=1 → the thread, and marks the landlord's messages read
 *   POST { text } → the agent's reply, emailed to the landlord
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function who(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  return userId ? findUserById(userId) : null;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = await who(req);
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const { id } = await ctx.params;
  const messages = await threadFor(id);
  /* Opening the panel is reading it - but never while viewing as somebody
     else, which would clear their "new" for them. */
  let viewingAs = false;
  try {
    assertNotViewingAs(req.cookies.get(VIEW_AS_COOKIE)?.value);
  } catch (e) {
    if (e instanceof ViewingAsRefused) viewingAs = true;
  }
  if (req.nextUrl.searchParams.get("read") === "1" && !viewingAs) await markThreadRead(id);
  return NextResponse.json({ ok: true, messages });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertNotViewingAs(req.cookies.get(VIEW_AS_COOKIE)?.value);
  } catch (e) {
    if (e instanceof ViewingAsRefused) return NextResponse.json({ ok: false, error: e.message }, { status: 423 });
    throw e;
  }
  const me = await who(req);
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const { id } = await ctx.params;
  const ma = await getAppraisal(id);
  if (!ma) return NextResponse.json({ ok: false, error: "No such appraisal." }, { status: 404 });
  const { text } = (await req.json().catch(() => ({}))) as { text?: string };
  const body = (text ?? "").trim();
  if (!body) return NextResponse.json({ ok: false, error: "Write something first." }, { status: 400 });
  if (body.length > 4000) return NextResponse.json({ ok: false, error: "Keep it under 4,000 characters." }, { status: 413 });
  try {
    const out = await replyAsAgent({ ma, me, body, origin: publicOrigin(req) });
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Couldn't send it." }, { status: 409 });
  }
}
