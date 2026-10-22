import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { whoIs } from "@/lib/admin";
import { leadScope } from "@/lib/scope";
import { leadViewings } from "@/lib/lead-viewings";

/**
 * GET /api/leads/viewings
 *
 * Every lead's booked viewings, for the Viewing column on Leads (Lorna,
 * 21 Oct 2026, ticket d44f5ea3). Scoped like the lead board. Reads only.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor, subject } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const scope = await leadScope(req);
  if (scope.unlinked) {
    return NextResponse.json({
      ok: false,
      unlinked: true,
      error: "We can't tell which REX user you are, so we can't show your leads' viewings. Ask James to link your account.",
    });
  }
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  try {
    const viewings = await leadViewings({ rexUserId: scope.everything ? null : scope.rexUserId, osUserId: (subject ?? actor).id });
    return NextResponse.json({ ok: true, viewings });
  } catch {
    return NextResponse.json({ ok: false, error: "The viewings didn't load. Try again in a minute." }, { status: 500 });
  }
}
