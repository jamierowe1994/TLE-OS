import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { asRole, can } from "@/lib/roles";
import { hasDb, q } from "@/lib/db";
import { msConfigured, msConnections } from "@/lib/microsoft";

/**
 * Who has connected their mailbox, for the pre-launch board.
 *
 * James, 30 Aug: a section in pre-launch showing whether each person is
 * connected, with a slider, so people can be walked through it one at a time
 * — "in case we have one issue, we're not gonna have multiple issues".
 *
 * Deliberately returns no tokens and no token metadata beyond a date. The only
 * things worth seeing are: is it on, WHICH mailbox it is, and can they send at
 * all. That third one is the trap — a person can have a mailbox connected and
 * still be unable to send, because the REX link is what puts the message on
 * the landlord's timeline. Showing only the mailbox would look ready when it
 * isn't.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorised" }, { status: 401 });
  const me = await findUserById(userId);
  if (!me || !can(asRole(me.role), "see:people")) {
    return NextResponse.json({ ok: false, error: "Not for you." }, { status: 403 });
  }
  if (!hasDb()) {
    return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  }

  const [people, connections] = await Promise.all([
    q<{ id: string; name: string; email: string; role: string; rex_user_id: string | null }>(
      `SELECT id, name, email, role, rex_user_id FROM os_users ORDER BY LOWER(name)`
    ),
    msConnections(),
  ]);

  return NextResponse.json({
    ok: true,
    configured: msConfigured(),
    people: people.map((p) => {
      const c = connections.get(p.id);
      return {
        userId: p.id,
        name: p.name || p.email,
        email: p.email,
        role: p.role,
        connected: Boolean(c),
        /* The mailbox they actually connected. Worth showing separately from
           their OS email: several people here hold more than one Microsoft
           login, and connecting the wrong one is silent until an email arrives
           from an address nobody recognises. */
        mailbox: c?.email ?? null,
        connectedAt: c?.connectedAt ?? null,
        /* Not a mailbox fact, but the other half of being able to send. */
        rexLinked: Boolean(p.rex_user_id),
      };
    }),
  });
}
