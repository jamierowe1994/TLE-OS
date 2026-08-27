import { NextRequest, NextResponse } from "next/server";
import { consumeVerification, VerificationError } from "@/lib/verification";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { createUser, findUserByEmail } from "@/lib/users";
import { isFoundingOwner } from "@/lib/email-policy";
import { hasDb } from "@/lib/db";

/**
 * "Here's my link and the password I've chosen."
 *
 * ── Why this route talks, where /start stayed silent ──────────────────────
 *
 * /start refuses to say whether an address exists, because anyone can post to
 * it. To get here you must be holding a live, single-use token that was
 * emailed to the address in question — so you have already proved you can read
 * that mailbox. There is nothing left to leak, and a person setting up an
 * account deserves to be told why their password was rejected.
 *
 * ── The order of operations matters ───────────────────────────────────────
 *
 * The password is validated BEFORE the token is consumed. Consuming first
 * would mean a nine-character password burns the link and forces a fresh
 * email — a genuinely infuriating way to lose four minutes, and the sort of
 * thing that gets a system a reputation before anybody has used it twice.
 *
 * The allowlist is re-checked here even though /start checked it. Tokens
 * outlive the state that minted them, and "it was allowed an hour ago" is not
 * the question being asked at the moment an account is created.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!hasDb()) {
    return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  }

  let body: { token?: string; name?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected a token, a name and a password." }, { status: 400 });
  }

  const token = (body.token ?? "").trim();
  const name = (body.name ?? "").trim();
  const password = body.password ?? "";

  if (!token) {
    return NextResponse.json({ ok: false, error: "That link is missing its code." }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ ok: false, error: "We need your name." }, { status: 400 });
  }
  // Checked before the token is spent — see the header.
  if (password.length < 10) {
    return NextResponse.json(
      { ok: false, error: "Passwords need at least 10 characters — this one guards the whole company's data." },
      { status: 400 }
    );
  }

  let email: string;
  try {
    ({ email } = await consumeVerification(token));
  } catch (e) {
    const msg = e instanceof VerificationError ? e.message : "That link isn't valid. Ask for a new one.";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }

  /* Re-checked at the moment of creation, not trusted from an hour ago. */
  if (!isFoundingOwner(email)) {
    return NextResponse.json(
      { ok: false, error: "That address isn't allowed an account yet. Ask James to add you." },
      { status: 403 }
    );
  }

  /* The token is already spent by here, so a race that got two requests
     through lands on this and the second one is told plainly. */
  if (await findUserByEmail(email)) {
    return NextResponse.json(
      { ok: false, error: "There's already an account on that address — sign in instead." },
      { status: 409 }
    );
  }

  const user = await createUser({ email, name, password });

  /* Signed straight in. They have just proved they own the address and chosen
     a password thirty seconds ago; making them type it again immediately is
     ceremony, not security. */
  const res = NextResponse.json({ ok: true, user });
  res.cookies.set(SESSION_COOKIE, createSessionToken(user.id), sessionCookieOptions(true));
  return res;
}
