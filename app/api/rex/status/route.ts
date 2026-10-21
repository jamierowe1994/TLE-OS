import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { rexStatusView } from "@/lib/rex-outage";

/**
 * Is REX down, and if so how old is the copy on screen (21 Oct 2026).
 * Read by the band (components/RexOutageBar) once a minute on every screen.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ down: false });
  const v = await rexStatusView();
  return NextResponse.json({
    down: v.down,
    copyTakenAt: v.copyTakenAt,
    oldestServedAt: v.oldestServedAt,
    waiting: v.waiting,
  });
}
