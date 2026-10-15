import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { leadScope } from "@/lib/scope";
import { archivedLeads } from "@/lib/hidden-leads";

/**
 * GET /api/leads/archived → the leads archived by hand, newest first, for the
 * Archived list on Leads. Same scope as the board: an owner the business, an
 * agent their own, an unlinked account nothing. Reactivate is DELETE on
 * /api/leads/<id>/hide.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: true, leads: [] });
  const scope = await leadScope(req);
  if (scope.unlinked) return NextResponse.json({ ok: true, leads: [] });
  try {
    const leads = await archivedLeads(scope.rexUserId, scope.rexUserId ? actor.email : null);
    return NextResponse.json({ ok: true, leads });
  } catch {
    return NextResponse.json({ ok: false, error: "The archive didn't load. Try again in a minute." }, { status: 500 });
  }
}
