import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { accessFor } from "@/lib/area-access";

/**
 * GET → what the signed-in person may see and do, area by area.
 *
 * Asked by two callers: the rail, to leave hidden areas off and say "look only"
 * above a screen; and the middleware, which cannot reach the database from the
 * edge and so asks here before letting a write through (it caches the answer
 * for a few seconds per person).
 *
 * The ACTOR, not the view-as subject. The switches control what a real pilot
 * agent can do; an owner looking through somebody's eyes is still an owner.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, gated: false, tester: false, levels: {} }, { status: 401 });
  const access = await accessFor(actor).catch(() => ({ gated: false, tester: false, levels: {} }));
  return NextResponse.json({ ok: true, ...access }, { headers: { "cache-control": "private, no-store" } });
}
