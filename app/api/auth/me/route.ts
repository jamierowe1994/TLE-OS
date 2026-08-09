import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { countUsers, findUserById } from "@/lib/users";
import { hasDb } from "@/lib/db";

/** Who is this, and does anybody have an account yet? The account screen
 *  needs both to decide between "sign in" and "set the first one up". */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!hasDb()) return NextResponse.json({ ok: true, user: null, anyUsers: false, hasDb: false });
  const id = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  const user = id ? await findUserById(id) : null;
  return NextResponse.json({ ok: true, user, anyUsers: (await countUsers()) > 0, hasDb: true });
}
