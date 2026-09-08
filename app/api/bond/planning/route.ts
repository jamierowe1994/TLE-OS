import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { listPlanning, planningStatus } from "@/lib/planning";

/**
 * The Planning room.
 *
 * GET ?districts=NN1,NN2          → the live applications in that patch, plus the status
 * GET ?kind=hmo                   → one kind only
 * GET ?council=Cornwall           → one council. The register is national, so
 *                                   this is the filter people reach for.
 * GET ?all=1                      → include the ones already on the board
 * GET ?decided=1                  → include refused and withdrawn
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!hasDb()) return NextResponse.json({ ok: false, reason: "Bond needs the database and this environment has none." }, { status: 503 });
  const p = req.nextUrl.searchParams;
  const districts = (p.get("districts") ?? "").split(",").map((d) => d.trim().toUpperCase()).filter(Boolean);
  try {
    const [applications, status] = await Promise.all([
      listPlanning({
        districts,
        kind: p.get("kind") ?? undefined,
        authority: p.get("council") ?? undefined,
        onlyNew: !p.get("all"),
        includeDecided: !!p.get("decided"),
      }),
      planningStatus(districts),
    ]);
    return NextResponse.json({ ok: true, applications, status });
  } catch (e) {
    return NextResponse.json({ ok: false, reason: (e as Error).message }, { status: 502 });
  }
}
