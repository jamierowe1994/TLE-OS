import "server-only";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById, type OsUser } from "@/lib/users";
import { readViewAs, VIEW_AS_COOKIE } from "@/lib/view-as";
import { can, type Capability } from "@/lib/roles";

/**
 * Who is an owner, and who is the OS pretending to be.
 *
 * Two different questions, and keeping them apart is the whole design:
 *
 *   actor   — the person actually signed in. Always the real one. Admin
 *             permission is decided on this and NEVER on the subject.
 *   subject — whose data to render. The actor, unless a view-as is open.
 *
 * If admin permission were decided on the subject, an owner viewing as an
 * agent would lose the admin bar and be unable to stop; worse, the inverse
 * mistake — deciding it on a spoofed subject — would hand admin to anyone.
 */

export interface Who {
  actor: OsUser | null;
  subject: OsUser | null;
  viewingAs: boolean;
}

export async function whoIs(req: NextRequest): Promise<Who> {
  const actorId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  const actor = actorId ? await findUserById(actorId) : null;
  if (!actor) return { actor: null, subject: null, viewingAs: false };

  const va = readViewAs(req.cookies.get(VIEW_AS_COOKIE)?.value);
  /* A view-as is only honoured if the ACTOR is an owner and the token was
     minted for them. A stale cookie from a previous owner session, or one
     copied between browsers, is ignored rather than trusted. */
  if (va && actor.role === "owner" && va.ownerId === actor.id) {
    const subject = await findUserById(va.subjectId);
    if (subject) return { actor, subject, viewingAs: true };
  }
  return { actor, subject: actor, viewingAs: false };
}

/** The signed-in owner, or null. Never the subject — see whoIs. */
export async function requireOwner(req: NextRequest): Promise<OsUser | null> {
  const { actor } = await whoIs(req);
  return actor?.role === "owner" ? actor : null;
}

/**
 * The signed-in person, if they hold a capability. Null otherwise.
 *
 * Decided on the ACTOR, never the subject — an owner viewing as an agent must
 * keep their own permissions, or they would lose the admin bar mid-session and
 * be unable to stop.
 */
export async function requireCapability(
  req: NextRequest,
  capability: Capability
): Promise<OsUser | null> {
  const { actor } = await whoIs(req);
  return actor && can(actor.role, capability) ? actor : null;
}
