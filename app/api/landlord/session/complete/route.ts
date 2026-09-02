import { NextRequest, NextResponse } from "next/server";
import { consumeVerification, VerificationError } from "@/lib/verification";
import { activateLandlord, landlordAccountByEmail } from "@/lib/landlord-account";
import { createPortalToken, LANDLORD_COOKIE, portalCookieOptions } from "@/lib/auth";
import { hasDb } from "@/lib/db";

/**
 * The link is opened. The token is spent, the cookie is set, and the page
 * is told whether this is their first time in, so it can show the welcome
 * once rather than every visit.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!hasDb()) {
    return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  }
  let token = "";
  try {
    token = String(((await req.json()) as { token?: string }).token ?? "").trim();
  } catch {
    /* falls through to the missing-code answer */
  }
  if (!token) {
    return NextResponse.json({ ok: false, error: "That link is missing its code." }, { status: 400 });
  }

  try {
    const { email } = await consumeVerification(token, "landlord");
    const account = await landlordAccountByEmail(email);
    if (!account) {
      /* The token was real but the row is gone - only possible if somebody
         deleted it between the email going and the link being opened. */
      return NextResponse.json({ ok: false, error: "That link isn't valid. Ask for a new one." }, { status: 400 });
    }
    const first = await activateLandlord(account.id);
    const res = NextResponse.json({ ok: true, first, name: account.name });
    res.cookies.set(LANDLORD_COOKIE, createPortalToken("landlord", account.id), portalCookieOptions());
    return res;
  } catch (e) {
    const msg = e instanceof VerificationError ? e.message : "That link isn't valid. Ask for a new one.";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
