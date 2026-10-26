import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { whoIs } from "@/lib/admin";
import { sameName, seesContactLists } from "@/lib/contact-mask";
import { getAppraisal } from "@/lib/appraisal-store";
import type { OsUser } from "@/lib/users";

/**
 * WHOSE MARKET APPRAISALS (James, 26 Oct 2026): "agents see only their own
 * market appraisals; office and owners see everyone's."
 *
 * Until then every agent saw every appraisal on the board, with another
 * agent's landlord's number and email shortened, and could open any of them
 * in full. Now an agent sees the appraisals with their name on them; anyone
 * whose role sees the whole business (see:everything: owners, the office,
 * pre-tenancy, compliance) sees them all.
 *
 * An appraisal holds its agent by name, so "theirs" is the same name match
 * the contact masking has used since 10 Oct (lib/contact-mask sameName). All
 * 18 live appraisals on 26 Oct named an agent with a login of that name.
 *
 * Viewing as somebody: their view, so an owner sees what the agent sees.
 */
export async function appraisalViewer(req: NextRequest): Promise<{ person: OsUser | null; all: boolean }> {
  const { actor, subject } = await whoIs(req);
  const person = subject ?? actor;
  return { person, all: Boolean(person && seesContactLists(person.role)) };
}

/** May this person see an appraisal held by `agent`? */
export function seesAppraisal(viewer: { person: OsUser | null; all: boolean }, agent: string | null | undefined): boolean {
  return viewer.all || Boolean(viewer.person && sameName(agent, viewer.person.name));
}

/**
 * The refusal for one appraisal's routes, or null when they may go on. An id
 * that is not there is left to the route's own "not found".
 */
export async function appraisalRefusal(req: NextRequest, id: string): Promise<NextResponse | null> {
  const viewer = await appraisalViewer(req);
  if (!viewer.person) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (viewer.all) return null;
  const ma = await getAppraisal(id).catch(() => null);
  if (!ma || seesAppraisal(viewer, ma.agent)) return null;
  return NextResponse.json({ ok: false, appraisal: null, error: "This market appraisal is another agent's, so it isn't open to you." }, { status: 403 });
}
