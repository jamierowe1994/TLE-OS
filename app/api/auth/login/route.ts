import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { authenticate } from "@/lib/users";
import { hasDb } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!hasDb()) {
    return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  }
  let body: { email?: string; password?: string; remember?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected an email and a password." }, { status: 400 });
  }

  const user = await authenticate(body.email ?? "", body.password ?? "");
  if (!user) {
    // One message for both wrong-address and wrong-password: saying which
    // confirms whether an address has an account here.
    return NextResponse.json({ ok: false, error: "That email and password don't match." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, user });
  res.cookies.set(SESSION_COOKIE, createSessionToken(user.id), sessionCookieOptions(body.remember !== false));
  return res;
}
