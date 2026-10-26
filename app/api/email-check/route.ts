import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { publicError } from "@/lib/public-error";
import { confirmEmailCheck, EMAIL_OK_COOKIE, emailCheckDue, emailOkCookie, EVERY_DAYS, maskedEmail, sendEmailCheck } from "@/lib/email-check";

/**
 * The every-few-days email check (lib/email-check).
 *
 *   GET                         due or not, and where the code goes
 *   POST { action: "send" }     a code to their own address (not again within a minute unless `again`)
 *   POST { action: "confirm", code }
 *
 * Always about the signed-in person themselves: the ACTOR, never somebody
 * being viewed as.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const passed = (res: NextResponse, userId: string) => {
  res.cookies.set(EMAIL_OK_COOKIE, emailOkCookie(userId), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: EVERY_DAYS * 86_400,
  });
  return res;
};

export async function GET(req: NextRequest) {
  const me = (await whoIs(req).catch(() => null))?.actor ?? null;
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  return NextResponse.json({ ok: true, due: await emailCheckDue(me.id), sentTo: maskedEmail(me.email), everyDays: EVERY_DAYS });
}

export async function POST(req: NextRequest) {
  const me = (await whoIs(req).catch(() => null))?.actor ?? null;
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { action?: string; code?: string; again?: boolean } | null;
  try {
    if (b?.action === "send") {
      if (!(await emailCheckDue(me.id))) return passed(NextResponse.json({ ok: true, done: true }), me.id);
      const r = await sendEmailCheck(me, Boolean(b.again));
      return "letThrough" in r ? passed(NextResponse.json({ ok: true, done: true, letThrough: true }), me.id) : NextResponse.json(r);
    }
    if (b?.action === "confirm") {
      const r = await confirmEmailCheck(me, String(b.code ?? ""));
      return r.ok ? passed(NextResponse.json({ ok: true, done: true }), me.id) : NextResponse.json(r, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "That didn't work just now. Try again in a moment.") }, { status: 500 });
  }
}
