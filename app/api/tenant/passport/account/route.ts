import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { getPassport, submitPassport } from "@/lib/passport";
import { createTenantFromPassport } from "@/lib/tenant-account";
import { createPortalToken, TENANT_COOKIE, portalCookieOptions } from "@/lib/auth";

/**
 * The end of the passport: an account, and straight in.
 *
 * The passport token is the credential, as it is for every other write on
 * this prefix: holding the link is what proves the email on it is theirs to
 * make an account for. The password is the only new thing asked. On
 * success the passport is marked finished, the tenant cookie is set, and the
 * portal opens on the next request.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  let body: { token?: string; password?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* falls through */
  }
  const token = String(body.token ?? "").trim();
  const password = String(body.password ?? "");
  if (!token) return NextResponse.json({ ok: false, error: "That passport link is missing its code." }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ ok: false, error: "Your password needs at least 8 characters." }, { status: 400 });

  const record = await getPassport(token).catch(() => null);
  if (!record) return NextResponse.json({ ok: false, error: "That passport could not be found." }, { status: 404 });

  const email = (record.data.email || record.email || "").trim();
  if (!email.includes("@")) {
    return NextResponse.json({ ok: false, error: "Add your email address on the first page - it becomes your username." }, { status: 400 });
  }

  const account = await createTenantFromPassport({
    email,
    name: record.data.legalName || record.name,
    password,
    passportToken: token,
  });
  await submitPassport(token).catch(() => null);

  const res = NextResponse.json({ ok: true, name: account.name });
  res.cookies.set(TENANT_COOKIE, createPortalToken("tenant", account.id), portalCookieOptions());
  return res;
}
