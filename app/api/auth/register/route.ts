import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions, verifySessionToken } from "@/lib/auth";
import { countUsers, createUser, findUserByEmail, findUserById } from "@/lib/users";
import { hasDb } from "@/lib/db";

/**
 * Creating an account.
 *
 * Open ONLY for the very first person — the whole site already sits behind
 * the office access code, so the first registration can only come from
 * someone who is already inside, and that person becomes the owner.
 *
 * After that it closes: a new account has to be created by someone already
 * signed in. Registration that stays open is how a preview link turns into
 * a stranger's account.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!hasDb()) {
    return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  }

  let body: { email?: string; name?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected an email, a name and a password." }, { status: 400 });
  }

  const email = (body.email ?? "").trim();
  const name = (body.name ?? "").trim();
  const password = body.password ?? "";

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: "That doesn't look like an email address." }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ ok: false, error: "We need your name." }, { status: 400 });
  }
  if (password.length < 10) {
    return NextResponse.json(
      { ok: false, error: "Passwords need at least 10 characters — this one guards the whole company's data." },
      { status: 400 }
    );
  }

  const existing = await countUsers();
  if (existing > 0) {
    // Not the first: an existing signed-in person must be doing the inviting.
    const me = await findUserById(verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value) ?? "");
    if (!me) {
      return NextResponse.json(
        { ok: false, error: "Accounts are created by someone already signed in." },
        { status: 401 }
      );
    }
  }

  if (await findUserByEmail(email)) {
    return NextResponse.json({ ok: false, error: "There's already an account on that address." }, { status: 409 });
  }

  const user = await createUser({ email, name, password });

  const res = NextResponse.json({ ok: true, user });
  // Only sign the FIRST person in automatically — an invite shouldn't log
  // the inviter out of their own session.
  if (existing === 0) {
    res.cookies.set(SESSION_COOKIE, createSessionToken(user.id), sessionCookieOptions(true));
  }
  return res;
}
