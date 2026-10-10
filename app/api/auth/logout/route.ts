import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { revokeSession } from "@/lib/session-revoke";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  /* Ends the session itself, not just this browser's copy of the cookie
     (Rig run 2, P-009): a copied token was good for the rest of its 30 days.
     A failure to record it still signs this browser out. */
  await revokeSession(req.cookies.get(SESSION_COOKIE)?.value).catch(() => {});
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
