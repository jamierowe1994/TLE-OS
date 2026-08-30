import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { can, asRole } from "@/lib/roles";
import { msDisconnect } from "@/lib/microsoft";

/**
 * Turning the slider back off.
 *
 * Deleting our stored refresh token stops US sending as them. It does NOT
 * revoke the consent they gave Microsoft — that lives in their account, and
 * only they or a tenant admin can withdraw it. Said plainly in the response
 * rather than implied, because "disconnected" that leaves a standing grant is
 * the sort of half-truth somebody makes a compliance decision on.
 *
 * An owner may disconnect somebody else — that is how James unsticks a person
 * whose connection has gone wrong without asking them to sign in.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorised" }, { status: 401 });
  const me = await findUserById(userId);
  if (!me) return NextResponse.json({ ok: false, error: "Unauthorised" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { userId?: string };
  const target = (body.userId ?? "").trim() || userId;

  if (target !== userId && !can(asRole(me.role), "manage:people")) {
    return NextResponse.json(
      { ok: false, error: "You can only disconnect your own mailbox." },
      { status: 403 }
    );
  }

  await msDisconnect(target);
  return NextResponse.json({
    ok: true,
    message:
      target === userId
        ? "Disconnected. We can no longer send as you. Microsoft still holds the permission you granted — remove it from your account if you want it gone entirely."
        : "Disconnected. They'll need to connect again before anything can send as them.",
  });
}
