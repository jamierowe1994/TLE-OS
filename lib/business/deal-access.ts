import "server-only";
import type { NextRequest } from "next/server";
import { whoIs } from "@/lib/admin";
import { can } from "@/lib/roles";
import type { OsUser } from "@/lib/users";
import { agentKeysForName } from "@/lib/business/roster";
import {
  dealBelongsToUser,
  getAllPropolyDeals,
  type BusinessDeal,
} from "@/lib/business/propoly-deals";
import type { DealNoteRole } from "@/lib/business/types";

/**
 * Who may touch a deal's notes, tasks, status and email thread.
 *
 * ── This file used to lock everybody out ──────────────────────────────────
 *
 * It was ported from the portal with its authentication intact, which meant it
 * read the portal's `tle_session` cookie and looked the id up in the portal's
 * `users` table. The OS only ever issues `os_session` over `os_users`. Nobody
 * signed into the OS has ever held a `tle_session`, so `verifySessionToken`
 * got `undefined`, returned null, and every one of the five /api/deals/[id]/*
 * routes answered 401 — notes, tasks, meta, emails, email-send.
 *
 * That is Kirstie's entire pre-tenancy screen. It read fine, because reads go
 * elsewhere; it just could not save anything, and a 401 on a note surfaces as
 * a save that quietly does not stick.
 *
 * The lesson worth keeping: this was a WHOLE FILE that compiled, type-checked
 * and passed review while being unreachable. `tsc` cannot see that two auth
 * systems exist and that this one imports the wrong one. Anything ported from
 * the portal needs its cookie checked by hand.
 *
 * ── Actor and subject, and which one each question takes ──────────────────
 *
 * Scoping — WHICH deals you may open — follows the subject, so an owner
 * viewing as an agent sees that agent's book and can tell what they see.
 *
 * Authorship follows the ACTOR. A note written by James while viewing as
 * Rhiannon was written by James, and signing it with her name would put words
 * in a real person's mouth in a thread the pre-tenancy team reads. Same rule
 * the assistant brief uses.
 */

export type DealAccess =
  | { ok: true; user: OsUser; deal: BusinessDeal; role: DealNoteRole }
  | { ok: false; status: number; error: string };

export async function resolveDealAccess(
  req: NextRequest,
  dealId: string
): Promise<DealAccess> {
  const { actor, subject } = await whoIs(req);
  if (!actor || !subject) return { ok: false, status: 401, error: "Unauthorised" };

  // Distinguish "Propoly unreachable / cache warming" (retryable 503) from
  // "that deal genuinely doesn't exist" (404).
  const deals = await getAllPropolyDeals().catch(() => null);
  if (deals == null) {
    return {
      ok: false,
      status: 503,
      error: "Propoly is warming up — try again in a few seconds.",
    };
  }
  const deal = deals.find((d) => d.app.id === dealId);
  if (!deal) {
    return { ok: false, status: 404, error: "Couldn't find that deal in Propoly." };
  }

  /* Business before pre-tenancy, which inverts the portal's order deliberately.
     The portal asked "is this a pre-tenancy address?" first because the two
     lists were separate env vars. Under capabilities an owner and a super_admin
     hold BOTH, so asking pretenancy first would sign James's and Susan's notes
     as the pre-tenancy team. */
  const role: DealNoteRole = can(actor.role, "see:business")
    ? "admin"
    : can(actor.role, "see:pretenancy")
      ? "pretenancy"
      : "agent";

  /* Unscoped for anyone who runs the business or the run-up to a move-in.
     `see:pretenancy` is named alongside `see:everything` on purpose: Kirstie's
     job spans every deal in the book, and support holds the first without the
     second. Dropping it here would leave her authorised and looking at nothing. */
  const unscoped =
    can(actor.role, "see:everything") || can(actor.role, "see:pretenancy");

  if (!unscoped) {
    /* os_users has no agentKey — the OS scopes on REX ids, not the roster. So
       match on email first (what Propoly actually records), and fall back to
       resolving their name against the roster, which is what covers a partner
       whose Propoly address differs from the one they sign in with. */
    const agentKey = agentKeysForName(subject.name)[0] ?? null;
    if (!dealBelongsToUser(deal, { email: subject.email, agentKey })) {
      return { ok: false, status: 403, error: "Forbidden" };
    }
  }

  return { ok: true, user: actor, deal, role };
}
