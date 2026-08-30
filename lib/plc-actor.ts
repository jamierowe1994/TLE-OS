import "server-only";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById, type OsUser } from "@/lib/users";

/**
 * Who is doing this.
 *
 * A thin wrapper over the session, in its own file because every PLC route
 * needs it and because of the second function below, which needs to be
 * somewhere obvious rather than tucked inside a route.
 */
export async function currentUser(req: NextRequest): Promise<OsUser | null> {
  const id = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  return id ? await findUserById(id) : null;
}

/** The name that goes on the record when somebody decides. */
export async function actorName(req: NextRequest, fallback = "Unknown"): Promise<string> {
  const me = await currentUser(req);
  if (me) return me.name;

  /* ── The dry-run harness, and why it cannot exist in production ──────────

     Walking the handover end to end needs two people: the agent who submits
     and the compliance officer who decides. On a laptop there is one signed-in
     account, so the harness lets the caller say which side it is playing.

     That is an impersonation header. In production it would let anybody put
     Kirstie's name against an approval by typing it into a fetch, which is
     the single worst thing that could happen to this record - the whole point
     of decided_by is that it is the name of the person who actually looked.

     So it is refused outright when NODE_ENV is production. Not gated behind a
     switch or an env var somebody could set by accident: refused. */
  if (process.env.NODE_ENV === "production") return fallback;
  const pretend = req.headers.get("x-plc-dry-run-as")?.trim();
  return pretend ? `${pretend} (dry run)` : fallback;
}
