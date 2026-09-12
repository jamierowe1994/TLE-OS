import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { tenantByPassword } from "@/lib/tenant-account";
import { createPortalToken, TENANT_COOKIE, portalCookieOptions } from "@/lib/auth";

/** Email and password, for tenants who made their account at the end of a
 *  passport. One answer for every failure, so nothing leaks about which
 *  emails we hold. */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  let body: { email?: string; password?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* falls through */
  }
  const account = await tenantByPassword(String(body.email ?? ""), String(body.password ?? "")).catch(() => null);
  if (!account) return NextResponse.json({ ok: false, error: "That email and password don't match." }, { status: 401 });
  const res = NextResponse.json({ ok: true, name: account.name });
  res.cookies.set(TENANT_COOKIE, createPortalToken("tenant", account.id), portalCookieOptions());
  return res;
}
