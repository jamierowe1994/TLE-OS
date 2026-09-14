import { NextRequest, NextResponse } from "next/server";
import { consumeVerification, VerificationError } from "@/lib/verification";
import { createSessionToken, hashPassword, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { createUser, findUserByEmail } from "@/lib/users";
import { isFoundingOwner } from "@/lib/email-policy";
import { isInvited, invitedRole, markInviteAccepted } from "@/lib/pilot";
import { hasDb, q } from "@/lib/db";

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
  if (!isFoundingOwner(email) && !(await isInvited(email))) {
    return NextResponse.json(
      { ok: false, error: "That address isn't allowed an account yet. Ask James to add you." },
      { status: 403 }
    );
  }

  /* ── An account that already exists is the NORMAL case for the pilot ─────
     
     Found 14 Sep 2026, testing the way in: an invite to somebody James had
     already created ended here, at "sign in instead" - and they had never had
     a password to sign in WITH. Worse, the token is spent by this line, so the
     link was dead and the only way through was the forgotten-password form.
     Kirstie's two invites both landed in exactly that hole.
     
     An invite means "here is your account, choose a password", so that is what
     it now does. It is the same act as a reset, with the same proof: a
     single-use link, minted only by an owner, sent to the address it names.
     
     The ROLE is not touched. Whatever they already are, they stay - a password
     being set must never be the thing that quietly changes what somebody can
     see. And their name is only filled in if the account has none. */
  const existing = await findUserByEmail(email);
  if (existing) {
    await q(`update os_users set password_hash = $1 where id = $2`, [hashPassword(password), existing.id]);
    if (!existing.name?.trim() && name.trim()) {
      await q(`update os_users set name = $1 where id = $2`, [name.trim(), existing.id]);
    }
    await markInviteAccepted(email);
    const res = NextResponse.json({ ok: true, user: existing, existed: true });
    res.cookies.set(SESSION_COOKIE, createSessionToken(existing.id), sessionCookieOptions(true));
    return res;
  }

  /* The role comes off the INVITE, which only an owner can write, and never
     off this request. The person redeeming a link has no say in what they
     become — otherwise the join form would be a self-service permission
     screen, and the one thing it must never be is that.

     A founding owner has no invite row to read, so they fall to "owner" the
     same way they always did. Everyone else gets what was chosen for them,
     and null still means agent. */
  const role = isFoundingOwner(email) ? "owner" : await invitedRole(email);
  const user = await createUser({ email, name, password, role });
  await markInviteAccepted(email);

  /* Signed straight in. They have just proved they own the address and chosen
     a password thirty seconds ago; making them type it again immediately is
     ceremony, not security. */
  const res = NextResponse.json({ ok: true, user });
  res.cookies.set(SESSION_COOKIE, createSessionToken(user.id), sessionCookieOptions(true));
  return res;
}
