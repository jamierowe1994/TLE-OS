import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { leadScope } from "@/lib/scope";
import { passportStates } from "@/lib/passport-states";

/**
 * GET /api/tenant/passports/states
 *
 * Every tenant passport's state - sent, started or completed - for the
 * Passport column and filter on Leads (James, 9 Oct 2026). Scoped like the
 * lead board. Reads only, and never a passport link.
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
  try {
    const passports = await passportStates({ rexUserId: scope.everything ? null : scope.rexUserId });
    return NextResponse.json({ ok: true, passports });
  } catch {
    return NextResponse.json({ ok: false, error: "The passports didn't load. Try again in a minute." }, { status: 500 });
  }
}
