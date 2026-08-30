import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { msAuthUrl, msConfigured, MS_STATE_COOKIE } from "@/lib/microsoft";
import { randomBytes } from "node:crypto";

/**
 * "Connect your email" — step one. Sends them to Microsoft to consent.
 *
 * The `state` nonce is minted here, put in a short-lived httpOnly cookie, and
 * checked on the way back. Without it, anyone could hand a signed-in agent a
 * crafted callback URL and attach THEIR mailbox to that agent's account — the
 * emails would then go out from a stranger's address under the agent's name,
 * which is the precise failure this whole feature exists to prevent.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";


export async function GET(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!userId) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (!msConfigured()) {
    return NextResponse.json(
      { error: "Microsoft isn't configured on this environment — AZURE_CLIENT_ID, AZURE_TENANT_ID and AZURE_CLIENT_SECRET are all needed." },
      { status: 503 }
    );
  }

  /* Bound to the user as well as random: a nonce that only proves "some tab of
     ours started this" would still let one signed-in person finish another's
     connection if they shared a browser profile. */
  const state = `${userId}.${randomBytes(16).toString("base64url")}`;
  const res = NextResponse.redirect(msAuthUrl(state));
  res.cookies.set(MS_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return res;
}
