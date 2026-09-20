import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { accessBoard } from "@/lib/access-board";

/**
 * GET /api/viewings/access?days=14
 *   → { ok, rows } - every viewing coming up and whether we can get in.
 *
 * Read-only, signed in. The Viewings screen leads with the ones that still
 * need chasing (James, 20 Sep 2026).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const days = Math.min(60, Math.max(1, Number(req.nextUrl.searchParams.get("days")) || 14));
  const rows = await accessBoard(days).catch(() => []);
  return NextResponse.json({ ok: true, days, rows });
}
