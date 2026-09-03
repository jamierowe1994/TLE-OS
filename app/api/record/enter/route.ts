import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions, verifySessionToken } from "@/lib/auth";
import { findUserByEmail } from "@/lib/users";
import { consumeVerification } from "@/lib/verification";
import { recordPagePath } from "@/lib/record-link";

/**
 * The door the video nudge opens.
 *
 * GET ?k=<token>&a=<appraisal>: the token is single use and minted for one
 * staff address (lib/record-link). A good one becomes a normal session for
 * that person and a redirect to the recorder. A bad one - used, expired,
 * made up - goes to sign-in with the recorder as the return path, so the
 * agent still ends up in the right place, one password later.
 *
 * Somebody already signed in keeps their session; the token is consumed
 * either way so it cannot be picked up by anyone else afterwards.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const token = (req.nextUrl.searchParams.get("k") ?? "").trim();
  const appraisalId = (req.nextUrl.searchParams.get("a") ?? "").trim();
  const path = appraisalId ? recordPagePath(appraisalId) : "/market-appraisals";
  const to = new URL(path, req.nextUrl.origin);

  const already = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);

  let email: string | null = null;
  try {
    email = (await consumeVerification(token, "record")).email;
  } catch {
    email = null;
  }

  if (already) return NextResponse.redirect(to);

  const user = email ? await findUserByEmail(email) : null;
  if (!user) {
    const signIn = new URL("/sign-in", req.nextUrl.origin);
    signIn.searchParams.set("next", path);
    return NextResponse.redirect(signIn);
  }

  const res = NextResponse.redirect(to);
  res.cookies.set(SESSION_COOKIE, createSessionToken(user.id), sessionCookieOptions(true));
  return res;
}
