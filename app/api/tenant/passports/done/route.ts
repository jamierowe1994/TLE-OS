import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { leadScope } from "@/lib/scope";
import { donePassports } from "@/lib/passports-done";

/**
 * GET /api/tenant/passports/done?limit=
 *
 * The tenants who have finished their passport, newest first - for the
 * Passports done view on Leads and the dashboard tile (Kirstie, 6 Oct 2026:
 * no viewing is booked until the passport is in). Scoped like the lead board:
 * the office sees everybody's, an agent their own. Never a passport link -
 * see lib/passports-done-shape.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const scope = await leadScope(req);
  if (scope.unlinked) {
    return NextResponse.json({
      ok: false,
      unlinked: true,
      error: "We can't tell which REX user you are, so we can't show your tenants' passports. Ask James to link your account.",
    });
  }
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });

  const asked = Number(req.nextUrl.searchParams.get("limit") ?? 300);
  const limit = Number.isFinite(asked) ? Math.min(500, Math.max(1, Math.floor(asked))) : 300;
  try {
    const passports = await donePassports({ rexUserId: scope.everything ? null : scope.rexUserId, limit });
    return NextResponse.json({ ok: true, passports });
  } catch {
    return NextResponse.json({ ok: false, error: "The passports didn't load. Try again in a minute." }, { status: 500 });
  }
}
