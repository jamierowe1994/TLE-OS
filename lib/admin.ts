import "server-only";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById, type OsUser } from "@/lib/users";
import { allAgents } from "@/lib/rex-agents";
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

/**
 * A subject built from REX rather than from os_users.
 *
 * ── The half of view-as that was never wired ──────────────────────────────
 *
 * `lib/view-as.ts` carries a REX id alongside the account id, and says why:
 * "the people worth testing as — Rhiannon, Kayleigh — have NO OS account."
 * The token was designed for it. `whoIs` simply never read it: it looked up
 * `subjectId` (which is the literal "-" for those people), found nothing, and
 * fell through to `subject: actor`.
 *
 * Nothing said so. The banner takes its name from the token, so it kept
 * announcing "You are viewing as Kayleigh Wright" while every figure on the
 * page was James's own. During a pilot where most partners have no account
 * yet, that is the ordinary case rather than an edge one — and it is worse
 * than a plain failure, because the screen is confidently mislabelled.
 *
 * ── Why a stand-in cannot escalate anything ───────────────────────────────
 *
 * The role is hardcoded to "agent" and never read from REX. Permission is
 * decided on the ACTOR everywhere in the OS (see requireCapability below), so
 * a subject grants nothing on its own; this only ever narrows what is shown.
 *
 * The id is deliberately `rex:<id>` — not a real os_users id, not blank, and
 * obviously synthetic in any log or row it reaches. Writing is already refused
 * while viewing as somebody (`assertNotViewingAs`), and `isStandIn` is here so
 * a write path can be certain rather than trusting that guard alone.
 */
function standIn(agent: { id: string; name: string; email: string; photo: string | null }, label: string): OsUser {
  return {
    id: `rex:${agent.id}`,
    email: agent.email,
    name: agent.name || label,
    /* Never from REX. A stand-in is an agent, whatever the person's real
       standing, because this exists to see an agent's screen. */
    role: "agent",
    photo: agent.photo,
    /* They have no account, so there is no date it was made. Empty rather
       than today's date, which would be a fact we invented. */
    createdAt: "",
    rexUserId: agent.id,
  };
}

/** Is this subject a REX stand-in rather than a real account? */
export function isStandIn(user: OsUser | null | undefined): boolean {
  return Boolean(user?.id.startsWith("rex:"));
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
    /* No OS account — the case the token was built for. Scope by their REX id
       instead. allAgents() is cached for 30 minutes in-process, so this is not
       a REX round trip per request, and it only runs on this branch. */
    if (va.rexUserId) {
      const agent = await allAgents()
        .then((rows) => rows.find((a) => a.id === va.rexUserId) ?? null)
        .catch(() => null);
      if (agent) return { actor, subject: standIn(agent, va.label), viewingAs: true };
    }
    /* Neither an account nor a REX record. Falling through would show the
       owner their own data under somebody else's name, so the caller is told
       plainly that there is no subject and can say so. */
    return { actor, subject: null, viewingAs: true };
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

/**
 * The signed-in person, if they hold ANY of these capabilities.
 *
 * For the handful of routes that genuinely serve two jobs. Paid leads and
 * organic social are read by Susan as business performance and by Francesca as
 * her own work; gating them on `see:business` alone meant the only way to give
 * Francesca her Paid leads screen was to give her GCI and arrears too.
 *
 * Deliberately a short list rather than a "staff can read it" shrug — every
 * caller names the two audiences it means, so widening one is a decision
 * somebody makes on purpose.
 */
export async function requireAnyCapability(
  req: NextRequest,
  capabilities: Capability[]
): Promise<OsUser | null> {
  const { actor } = await whoIs(req);
  return actor && capabilities.some((c) => can(actor.role, c)) ? actor : null;
}
