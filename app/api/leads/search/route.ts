import { NextRequest, NextResponse } from "next/server";
import { scopeFor } from "@/lib/scope";
import { searchLedger } from "@/lib/lead-ledger";
import { hiddenLeadIds } from "@/lib/hidden-leads";

/**
 * GET /api/leads/search?q= → leads on file matching q, beyond the newest 500
 * the board loads. Same scope as the board: an owner the business, an agent
 * their own, an unlinked account nothing.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const needle = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 80);
  const scope = await scopeFor(req);
  if (scope.unlinked) return NextResponse.json({ ok: true, leads: [] });
  const [found, hidden] = await Promise.all([
    searchLedger(scope.rexUserId, needle).catch(() => []),
    hiddenLeadIds().catch(() => new Set<string>()),
  ]);
  return NextResponse.json({ ok: true, leads: found.filter((l) => !hidden.has(l.id)) });
}
