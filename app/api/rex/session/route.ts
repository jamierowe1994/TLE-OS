import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { forgetRex, rexSessionFor, signInToRex } from "@/lib/rex-user";
import { ensureRexLink, findUserById } from "@/lib/users";
import { record } from "@/lib/audit";
import { isOwner } from "@/lib/agent-words";

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
  if (!out.ok) {
    /* KEPT, IN REX'S WORDS (19 Oct 2026). Rovena Buci and Ed Westwood both
       said their REX email and password were right and this kept refusing
       them, and there was nothing to look at afterwards: the reason was
       rewritten into the sentence below and then thrown away. It now goes to
       the log and the audit trail - the address tried and what REX said,
       never the password - so the next "it will not let me in" is answered
       from Activity rather than guessed at. */
    await record({
      kind: "rex_signin_failed",
      actorId: userId,
      subjectEmail: email,
      detail: `${out.rex} (http ${out.status})`.slice(0, 300),
    }).catch(() => null);

    /* REX's own words are "Username or password not valid." On 16 Oct 2026
       agents fresh from choosing their TLE OS password typed that one here,
       read REX's line as "the OS doesn't recognise my email", and stopped.
       Say whose password this box wants. */
    const refused = /username or password|not valid|invalid/i.test(out.error);
    const error = refused
      ? "REX didn't accept that email and password. This box wants the ones you use to sign in to REX itself - your REX password, not the TLE OS one you just chose."
      : out.error;
    /* An owner gets REX's sentence as well as ours: Susan and James are the
       two people who can do anything about a user REX has disabled, and they
       cannot if the screen will not tell them what it was told. */
    const who = await findUserById(userId).catch(() => null);
    return NextResponse.json(
      { ok: false, error, refused, ...(who && isOwner(who) ? { rex: out.rex } : {}) },
      { status: 401 }
    );
  }
  /* Signed in to REX: they are that REX user, so join the two now, even when
     their REX email isn't their OS one (lib/users ensureRexLink). */
  const user = await findUserById(userId).catch(() => null);
  if (user) await ensureRexLink(user).catch(() => null);
  return NextResponse.json({ ok: true, expiresAt: out.expiresAt });
}

export async function DELETE(req: NextRequest) {
  const userId = me(req);
  if (!userId) return NextResponse.json({ ok: false, error: "Sign in to the OS first." }, { status: 401 });
  await forgetRex(userId);
  return NextResponse.json({ ok: true });
}
