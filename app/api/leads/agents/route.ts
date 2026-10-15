import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { leadAgents } from "@/lib/lead-agents";
import { worksThePool } from "@/lib/lead-owner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/leads/agents - who a lead can be passed to, and where their work
 * is (lib/lead-agents). Names and towns only: no phones, no emails beyond the
 * key the picker sends back. `pool` says whether this person works the
 * office's pool, so the picker can say where "Back to the office" goes.
 */
export async function GET(req: NextRequest) {
  const who = await whoIs(req);
  if (!who.actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  try {
    const agents = await leadAgents();
    return NextResponse.json({
      ok: true,
      agents: agents.map((a) => ({ key: a.key, name: a.name, towns: a.towns, rexUserId: a.rexUserId })),
      pool: worksThePool(who),
    });
  } catch {
    return NextResponse.json({ ok: false, error: "We couldn't read the list of agents just now. Try again in a minute." }, { status: 503 });
  }
}
