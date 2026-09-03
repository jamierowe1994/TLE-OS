import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { competitorAgents, competitorDoors } from "@/lib/competitors";

/**
 * Who manages what in the patch.
 *
 * GET ?districts=NN1,NN2            → the agents, with stock, tenanted, on market, anniversaries in 90 days
 * GET ?districts=...&agent=Leaders  → that agent's doors (all agents when absent)
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!hasDb()) return NextResponse.json({ ok: false, reason: "Bond needs the database and this environment has none." }, { status: 503 });
  const p = req.nextUrl.searchParams;
  const districts = (p.get("districts") ?? "").split(",").map((d) => d.trim().toUpperCase()).filter(Boolean);
  const agent = p.get("agent") ?? undefined;
  try {
    if (p.get("doors")) return NextResponse.json({ ok: true, doors: await competitorDoors(districts, agent) });
    return NextResponse.json({ ok: true, agents: await competitorAgents(districts) });
  } catch (e) {
    return NextResponse.json({ ok: false, reason: (e as Error).message }, { status: 502 });
  }
}
