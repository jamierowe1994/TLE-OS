import "server-only";
import type { NextRequest } from "next/server";
import { whoIs } from "@/lib/admin";
import { bookScope } from "@/lib/scope";
import { onTheirBook } from "@/lib/assistant-book";
import { readListingDetails } from "@/lib/listing-details";
import type { CaseStudy } from "@/lib/case-studies";

/**
 * Who may start and edit a case study. The same line as the home's own page:
 * the whole-business desks and owners may do any; an agent may do the homes
 * on their book (listings or Portfolio) and any listing REX names them on as
 * listing agent - an older let that has dropped off both is still their work,
 * which is the point of a case study.
 */
export async function caseActor(req: NextRequest) {
  const who = await whoIs(req);
  if (!who.actor) return null;
  const scope = await bookScope(req, who);
  return { actor: who.actor, scope };
}

export async function mayStart(req: NextRequest, listingId: string): Promise<{ ok: true; by: string } | { ok: false; status: number; error: string }> {
  const a = await caseActor(req);
  if (!a) return { ok: false, status: 401, error: "Sign in first." };
  if (a.scope.everything) return { ok: true, by: a.actor.id };
  if (a.scope.unlinked || !a.scope.rexUserId) return { ok: false, status: 403, error: "Your account isn't linked to your listings yet, so a case study can't be started from it." };
  const mine = await onTheirBook(a.scope.rexUserId, listingId).catch(() => null);
  if (mine?.listing || mine?.home) return { ok: true, by: a.actor.id };
  const d = await readListingDetails(Number(listingId), { cached: true }).catch(() => null);
  if (d?.agent.id && d.agent.id === a.scope.rexUserId) return { ok: true, by: a.actor.id };
  return { ok: false, status: 404, error: "That home isn't one of yours." };
}

export async function mayEdit(req: NextRequest, c: CaseStudy): Promise<boolean> {
  const a = await caseActor(req);
  if (!a) return false;
  if (a.scope.everything) return true;
  if (c.createdBy === a.actor.id) return true;
  return !!a.scope.rexUserId && c.agentRexId === a.scope.rexUserId;
}
