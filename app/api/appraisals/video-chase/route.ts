import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { getAppraisal } from "@/lib/appraisal-store";
import { ResendBlocked } from "@/lib/resend";
import { ExternalRecipientRefused } from "@/lib/email-policy";
import {
  buildVideoChase,
  chaseSendAt,
  declineVideoChase,
  queueVideoChase,
  queuedVideoChase,
  sendVideoChaseNow,
  videoRecorded,
} from "@/lib/video-chase";
import { publicOrigin } from "@/lib/origin";
import { sendPreNow } from "@/lib/pre-send";

/**
 * The video nudge for one appraisal.
 *
 * GET  ?id=…                 → who it would go to, when, and whether one is queued
 * POST { id, mode: "now" }   → send it to the signed-in person this minute
 * POST { id, mode: "queue" } → put it on the queue for two days before the visit
 * POST { id, mode: "decline" } → send the pre-presentation now, without a video
 * POST { id, mode: "send" }    → send the pre-presentation now, video and all
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

  const mode = body.mode === "queue" ? "queue" : body.mode === "decline" ? "decline" : body.mode === "send" ? "send" : "now";
  try {
    /* Both send the pre-presentation this minute (Howard, approved by James
       1 Oct 2026). Declining also records the choice, as it always has. Not
       sent because customer email is off here: ok, and `held` says so - it
       stays on the queue and goes when the switch does. */
    if (mode === "decline" || mode === "send") {
      if (mode === "decline") await declineVideoChase({ ma, me, origin: origin(req) });
      const r = await sendPreNow({ ma, me, origin: origin(req) });
      if (!r.sent && !r.held) return NextResponse.json({ ok: false, error: r.detail }, { status: 409 });
      return NextResponse.json({ ok: true, declined: mode === "decline", ...r });
    }
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
