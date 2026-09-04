import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { can } from "@/lib/roles";
import { listDealEvents, watchStatus } from "@/lib/business/deal-watch";

/**
 * GET /api/pretenancy/feed → the deal moves the watcher has recorded.
 *
 * Kirstie (see:pretenancy) reads the whole book. An agent reads only the
 * deals whose property they manage in Propoly - matched on the email their
 * portal login shares with Propoly, the same key the applications tab uses.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  const me = userId ? await findUserById(userId) : null;
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });

  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 60) || 60;
  const whole = can(me.role, "see:pretenancy");
  const [events, status] = await Promise.all([
    listDealEvents({ agentEmail: whole ? null : me.email, limit }),
    watchStatus(),
  ]);
  return NextResponse.json({ ok: true, scope: whole ? "all" : "mine", lastSeenAt: status.lastSeenAt, events });
}
