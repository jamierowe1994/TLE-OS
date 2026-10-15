import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { hasDb, q } from "@/lib/db";

/**
 * POST /api/tenant/passport/opened?token= - the tenant has the passport open
 * (15 Oct 2026, Admin > Tracking).
 *
 * Sent by the form itself once it is running in the tenant's browser, so an
 * email scanner or a link preview fetching the address is not an open: they
 * read the page, they do not run it. Somebody signed in to the OS opening the
 * link (an agent checking it, a tester) is not counted either.
 *
 * Before this, the only record of an open was Railway's HTTP log.
 *
 * Answers 204 whatever happens, and says nothing about whether the token
 * exists: the token is the tenant's credential (see app/api/tenant/passport).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const token = (req.nextUrl.searchParams.get("token") ?? "").slice(0, 100);
    const staff = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
    if (token && !staff && hasDb()) {
      await q(
        `UPDATE os_tenant_passports
            SET opened_at = COALESCE(opened_at, NOW()), last_opened_at = NOW(), opens = opens + 1
          WHERE token = $1 AND contact_id IS DISTINCT FROM 'demo'`,
        [token]
      );
    }
  } catch {
    /* never surfaced */
  }
  return new NextResponse(null, { status: 204 });
}
