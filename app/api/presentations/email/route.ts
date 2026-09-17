import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { ResendBlocked } from "@/lib/resend";
import { emailDeckToMe } from "@/lib/deck-reminders";
import { publicOrigin } from "@/lib/origin";

/**
 * POST { token, appraisalId? } - Send presentation to my email, from the
 * builder (James, 17 Sep 2026). To the signed-in person, whoever the agent
 * on the appraisal is: they pressed it.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  const me = userId ? await findUserById(userId) : null;
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { token?: string; appraisalId?: string };
  const token = (body.token ?? "").trim();
  if (!token) return NextResponse.json({ ok: false, error: "Which presentation?" }, { status: 400 });
  try {
    const { to } = await emailDeckToMe({ token, me, origin: publicOrigin(req), appraisalId: body.appraisalId ?? null });
    return NextResponse.json({ ok: true, to });
  } catch (e) {
    const locked = e instanceof ResendBlocked;
    return NextResponse.json(
      { ok: false, error: locked ? "Email isn't switched on here, so it couldn't send." : e instanceof Error ? e.message : "It didn't send." },
      { status: locked ? 503 : 500 }
    );
  }
}
