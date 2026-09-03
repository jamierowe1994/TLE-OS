import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { getAppraisal } from "@/lib/appraisal-store";
import { ResendBlocked } from "@/lib/resend";
import { ExternalRecipientRefused } from "@/lib/email-policy";
import {
  buildVideoChase,
  chaseSendAt,
  queueVideoChase,
  queuedVideoChase,
  sendVideoChaseNow,
  videoRecorded,
} from "@/lib/video-chase";
import { publicOrigin } from "@/lib/origin";

/**
 * The video nudge for one appraisal.
 *
 * GET  ?id=…                 → who it would go to, when, and whether one is queued
 * POST { id, mode: "now" }   → send it to the signed-in person this minute
 * POST { id, mode: "queue" } → put it on the queue for two days before the visit
 *
 * Reaches a colleague on our own domain, as the direct result of that
 * colleague pressing a button - the same footing as the agent briefing, and
 * for the same reason no switch stands in front of it. lib/email-policy
 * refuses anything that is not a TLE address at the transport.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const origin = publicOrigin;

async function who(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  return userId ? findUserById(userId) : null;
}

export async function GET(req: NextRequest) {
  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "Which appraisal?" }, { status: 400 });
  const me = await who(req);
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const ma = await getAppraisal(id);
  if (!ma) return NextResponse.json({ ok: false, error: "No such appraisal." }, { status: 404 });

  const [built, queued, recorded] = await Promise.all([
    buildVideoChase({ ma, me, origin: origin(req) }),
    queuedVideoChase(ma.id),
    videoRecorded(ma),
  ]);
  const sendAt = chaseSendAt(ma);
  return NextResponse.json({
    ok: true,
    to: built.to.email,
    matchedAgent: built.to.matched,
    subject: built.subject,
    sendAt: sendAt ? sendAt.toISOString() : null,
    queued,
    recorded,
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { id?: string; mode?: string };
  const id = (body.id ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "Which appraisal?" }, { status: 400 });
  const me = await who(req);
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const ma = await getAppraisal(id);
  if (!ma) return NextResponse.json({ ok: false, error: "No such appraisal." }, { status: 404 });

  const mode = body.mode === "queue" ? "queue" : "now";
  try {
    if (mode === "queue") {
      const r = await queueVideoChase({ ma, me, origin: origin(req) });
      return NextResponse.json({ ok: true, ...r });
    }
    const sent = await sendVideoChaseNow({ ma, me, origin: origin(req), toMe: true });
    return NextResponse.json({ ok: true, sent: true, ...sent });
  } catch (e) {
    const status = e instanceof ResendBlocked || e instanceof ExternalRecipientRefused ? 409 : 502;
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "That didn't send." },
      { status }
    );
  }
}
