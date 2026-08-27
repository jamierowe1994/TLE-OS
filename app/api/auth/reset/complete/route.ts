import { NextRequest, NextResponse } from "next/server";
import { consumeVerification, VerificationError } from "@/lib/verification";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions, hashPassword } from "@/lib/auth";
import { findUserByEmail } from "@/lib/users";
import { hasDb, q } from "@/lib/db";

/**
 * Setting a new password from a reset link.
 *
 * Like /verify/complete: the password is checked BEFORE the token is spent, so
 * a nine-character attempt does not burn the link and force a fresh email.
 *
 * The new hash is written straight to os_users rather than through a helper,
 * because there was no "change this person's password" path before this and
 * inventing a general one invites a caller who supplies the email but not the
 * proof. Here the proof is the consumed token, and the email comes FROM it —
 * never from the request body.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!hasDb()) {
    return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  }

  let body: { token?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected a token and a password." }, { status: 400 });
  }

  const token = (body.token ?? "").trim();
  const password = body.password ?? "";
  if (!token) {
    return NextResponse.json({ ok: false, error: "That link is missing its code." }, { status: 400 });
  }
  if (password.length < 10) {
    return NextResponse.json(
      { ok: false, error: "Passwords need at least 10 characters — this one guards the whole company's data." },
      { status: 400 }
    );
  }

  let email: string;
  try {
    ({ email } = await consumeVerification(token, "reset"));
  } catch (e) {
    const msg = e instanceof VerificationError ? e.message : "That link isn't valid. Ask for a new one.";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }

  const user = await findUserByEmail(email);
  if (!user) {
    // Deleted between asking and clicking. Rare, but it is a real state.
    return NextResponse.json(
      { ok: false, error: "That account no longer exists." },
      { status: 404 }
    );
  }

  await q(`update os_users set password_hash = $1 where id = $2`, [hashPassword(password), user.id]);

  const res = NextResponse.json({ ok: true, user });
  res.cookies.set(SESSION_COOKIE, createSessionToken(user.id), sessionCookieOptions(true));
  return res;
}
