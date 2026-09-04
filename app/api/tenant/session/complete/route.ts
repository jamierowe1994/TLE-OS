import { NextRequest, NextResponse } from "next/server";
import { consumeVerification, VerificationError } from "@/lib/verification";
import { activateTenant, tenantAccountByEmail } from "@/lib/tenant-account";
import { createPortalToken, TENANT_COOKIE, portalCookieOptions } from "@/lib/auth";
import { hasDb } from "@/lib/db";

/** The link is opened. The token is spent, the cookie is set. */

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
    /* falls through */
  }
  if (!token) return NextResponse.json({ ok: false, error: "That link is missing its code." }, { status: 400 });

  try {
    const { email } = await consumeVerification(token, "tenant");
    const account = await tenantAccountByEmail(email);
    if (!account) {
      return NextResponse.json({ ok: false, error: "That link isn't valid. Ask for a new one." }, { status: 400 });
    }
    const first = await activateTenant(account.id);
    const res = NextResponse.json({ ok: true, first, name: account.name });
    res.cookies.set(TENANT_COOKIE, createPortalToken("tenant", account.id), portalCookieOptions());
    return res;
  } catch (e) {
    const msg = e instanceof VerificationError ? e.message : "That link isn't valid. Ask for a new one.";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
