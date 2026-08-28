import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions, verifySessionToken } from "@/lib/auth";
import { countUsers, createUser, findUserByEmail, findUserById } from "@/lib/users";
import { hasDb } from "@/lib/db";
import { isFoundingOwner } from "@/lib/email-policy";

/**
 * Creating an account.
 *
 * ── Two gates, and the first one is new ───────────────────────────────────
 *
 * **1. The address must be on the founding allowlist.** James and Susan only,
 * per his instruction on 27 Aug. This is checked BEFORE anything else and
 * applies whether or not anyone is signed in.
 *
 * It was added because the original design rested on one assumption that has
 * since stopped being true: "the whole site already sits behind the office
 * access code, so the first registration can only come from someone who is
 * already inside." The access code has since been shared over chat. A secret
 * that has been transmitted is not a secret, and it was the ONLY thing
 * standing between a stranger and an owner account on an empty user table.
 *
 * The allowlist does not care whether the code leaked. Even holding it, you
 * cannot make an account unless you control one of two named mailboxes.
 *
 * **2. After the first person, an invite.** A new account has to be created by
 * someone already signed in. Registration that stays open is how a preview
 * link turns into a stranger's account.
 *
 * ── When the invite flow lands ────────────────────────────────────────────
 *
 * The allowlist is a stopgap for exactly as long as it takes to build email
 * verification (see docs/MULTI-TENANT.md). It is not the long-term answer —
 * hard-coding staff is not a multi-tenant platform. It IS the right answer
 * for today, because today the alternative is an open door.
 *
 * NOBODY'S PASSWORD IS SET HERE BY ANYONE BUT ITS OWNER. It arrives from the
 * person themselves, is hashed, and the plaintext is never stored or logged.
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

  /* GATE ONE — the founding allowlist. Before the password rules, before the
     user count, before anything touches the database. See the header. */
  if (!isFoundingOwner(email)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Accounts are limited to the two founding addresses while the invite flow is being built. Ask James to add you.",
      },
      { status: 403 }
    );
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

  /* ALWAYS requires a signed-in person now, including for the very first
     account. The old first-user bypass leaned on the office access code being
     the outer door; that door is gone, so the bypass would have made this
     endpoint a way to mint an account from the open internet. Joining is
     /join, which needs a token emailed to the address. */
  const existing = await countUsers();
  const me = await findUserById(verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value) ?? "");
  if (!me) {
    return NextResponse.json(
      { ok: false, error: "Accounts are created by someone already signed in, or through an invite link." },
      { status: 401 }
    );
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
