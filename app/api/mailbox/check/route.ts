import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import {
  MailboxNotConnected,
  msAccessTokenFor,
  msConnectionFor,
  msGetMe,
} from "@/lib/microsoft";

/**
 * "Did my mailbox actually connect?"
 *
 * Asked the moment somebody comes back from the Microsoft consent screen.
 * Until now nothing asked it: the callback redirected to /setup?mail=connected
 * and the wizard redrew the same "Connect Your Email" screen, button and all,
 * so a person who had just done exactly as they were asked was shown no
 * difference whatsoever. Several new starters read that as a failure and tried
 * again, or gave up and messaged James.
 *
 * ── Why it is not enough to read the row ──────────────────────────────────
 *
 * os_ms_tokens having a row means a refresh token was stored. It does not mean
 * the connection WORKS: consent can be withdrawn, a tenant admin can revoke
 * it, and a token can be stored and be refused on first use. "Connected" on a
 * done screen is a promise, so this redeems the refresh token for an access
 * token and calls Microsoft's /me with it. If that answers, the mailbox is
 * genuinely reachable right now and the address it reports is authoritative.
 *
 * Deliberately NOT a send. /api/mailbox/test exists for proving delivery and
 * puts a real message in somebody's inbox; a confirmation screen must not mail
 * anybody to render itself, and nothing goes out without James's say-so.
 *
 * Read-only, so GET, and never cached: the whole point is the answer as of
 * this second.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorised" }, { status: 401 });

  const no = (problem: string, stored: string | null = null) =>
    NextResponse.json(
      { ok: true, connected: false, email: stored, problem },
      { headers: { "cache-control": "private, no-store" } }
    );

  const conn = await msConnectionFor(userId).catch(() => null);
  if (!conn) {
    return no("We could not reach the OS's own records to check. Try again in a moment.");
  }
  if (!conn.connected) {
    /* No row at all. Either they never finished at Microsoft, or the callback
       failed - and the callback's own code in ?mail= says which, so this says
       the plain thing and leaves the diagnosis to the screen. */
    return no("Your mailbox is not connected yet.");
  }

  try {
    const token = await msAccessTokenFor(userId);
    const me = await msGetMe(token);
    return NextResponse.json(
      {
        ok: true,
        connected: true,
        /* Microsoft's answer, not ours. Several people here have more than one
           365 login, and the address email actually leaves from is the one to
           put on screen. */
        email: me.email || conn.email,
        /* Worth knowing on the rare occasion the two disagree: the stored row
           is what everything else in the OS sends as. */
        stored: conn.email,
        connectedAt: conn.connectedAt,
      },
      { headers: { "cache-control": "private, no-store" } }
    );
  } catch (e) {
    if (e instanceof MailboxNotConnected) {
      return no(
        "Microsoft would not give us a token for your mailbox, so the connection did not hold. Connect it again.",
        conn.email
      );
    }
    return no(publicError(e, "We could not check your mailbox just then."), conn.email);
  }
}
