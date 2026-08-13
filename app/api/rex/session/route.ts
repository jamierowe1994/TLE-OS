import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { forgetRex, rexSessionFor, signInToRex } from "@/lib/rex-user";

/**
 * Signing one person into REX, so their work is filed under their name.
 *
 * The password crosses this route once and is never written down — it goes
 * straight to REX's own login and the function returns a token. Nothing here
 * logs the body, and nothing stores it.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function me(req: NextRequest): string | null {
  return verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
}

export async function GET(req: NextRequest) {
  return NextResponse.json(await rexSessionFor(me(req)));
}

export async function POST(req: NextRequest) {
  const userId = me(req);
  if (!userId) return NextResponse.json({ ok: false, error: "Sign in to the OS first." }, { status: 401 });

  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected JSON." }, { status: 400 });
  }
  const email = (body.email ?? "").trim();
  const password = body.password ?? "";
  if (!email || !password) {
    return NextResponse.json({ ok: false, error: "Both your REX email and password are needed." }, { status: 400 });
  }

  const out = await signInToRex(userId, email, password);
  if (!out.ok) return NextResponse.json({ ok: false, error: out.error }, { status: 401 });
  return NextResponse.json({ ok: true, expiresAt: out.expiresAt });
}

export async function DELETE(req: NextRequest) {
  const userId = me(req);
  if (!userId) return NextResponse.json({ ok: false, error: "Sign in to the OS first." }, { status: 401 });
  await forgetRex(userId);
  return NextResponse.json({ ok: true });
}
