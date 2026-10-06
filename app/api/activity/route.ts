import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { activity } from "@/lib/activity";

/**
 * GET /api/activity → when each listing and application was last worked on,
 * for the Activity order on both boards (6 Oct 2026). Times only - no names,
 * no content - so it is safe to serve whole to anybody signed in; each board
 * only ever looks up the rows it is already showing.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...(await activity()) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Couldn't read activity." }, { status: 500 });
  }
}
