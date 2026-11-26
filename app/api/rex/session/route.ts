import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { forgetRex, rexSessionFor, signInToRex } from "@/lib/rex-user";
import { ensureRexLink, findUserById } from "@/lib/users";
import { record } from "@/lib/audit";
import { agentByEmail } from "@/lib/rex-agents";
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

    /* ONE SENTENCE, SEVERAL FAULTS (19 Oct 2026). REX answers "Username or
       password not valid" whether the password is wrong, the address is
       unknown, or the user is switched off, so the refusal cannot say which.

       NOT two-factor, which is worth writing down because it looked like the
       answer for an hour: Rovena Buci and Edward Westwood both have to enter
       an auth code, and so does James, whose password sign-in here succeeded
       on the same morning theirs were refused. Having it on does not stop
       Authentication/login.

       What it was: neither of them knows their REX password. Their Mac fills
       it on REX's own website, so it works there without ever being typed,
       and what they typed here was a guess. So before blaming the password
       outright, ask REX whether it knows this address and whether that user
       is live; when it does, say where the real password is kept rather than
       telling somebody to try harder to remember it. Only on the failure
       path, so a working sign-in pays nothing for it. */
    const known = refused ? await agentByEmail(email).catch(() => null) : null;

    const error = known?.active
      ? "REX knows this address and your account is live, so it is the password itself. If your browser or your Mac fills your REX password in for you on REX's own website, you will never have typed it, and this box needs it typed. On a Mac: System Settings, then Passwords, search for rex, reveal it and paste it here. If it is not saved there, press \u201cCarry on and connect REX later\u201d and ask James for a REX password reset."
      : refused
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
