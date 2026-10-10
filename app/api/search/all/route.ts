import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { scopeFor, searchScope } from "@/lib/scope";
import { searchAll } from "@/lib/search-all";

/**
 * GET /api/search/all?q=… → Search for anything, grouped (lib/search-all):
 * Tenant, Landlord, Back office, Portfolio, Works orders. Scoped like the
 * old bar: an agent searches their own book; an owner viewing as somebody
 * searches theirs.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const who = await whoIs(req);
  if (!who.actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const needle = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 120);
  if (needle.length < 2) return NextResponse.json({ ok: true, groups: [] });
  const scope = await scopeFor(req);
  const rexUserId = await searchScope(req, scope);
  if (rexUserId === false) {
    return NextResponse.json({ ok: true, groups: [], reason: "Your account isn't linked to your agent record yet, so search has nothing of yours to look through. Ask James to link it." });
  }
  const me = who.subject ?? who.actor;
  const result = await searchAll(needle, { rexUserId, me: { name: me.name ?? "", email: me.email ?? "" } });
  return NextResponse.json({ ok: true, ...result });
}
