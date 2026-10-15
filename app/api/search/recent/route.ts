import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { scopeFor, searchScope } from "@/lib/scope";
import { noteRecent, parseRef, recentFor } from "@/lib/search-recent";

/**
 * GET  /api/search/recent        → the files this person opened last, newest
 *                                  first, as search rows (lib/search-recent);
 *                                  only those they can open now.
 * POST /api/search/recent {ref}  → a file opened: to the top of their list.
 *
 * Kept against whoever is signed in. An owner viewing as somebody keeps their
 * own list, shown through that person's book like search is.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const who = await whoIs(req);
  if (!who.actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const scope = await scopeFor(req);
  const rexUserId = await searchScope(req, scope);
  if (rexUserId === false) return NextResponse.json({ ok: true, items: [] });
  const me = who.subject ?? who.actor;
  try {
    const items = await recentFor(who.actor.id, { rexUserId, me: { name: me.name ?? "", email: me.email ?? "" }, tester: who.actor.email ?? null });
    return NextResponse.json({ ok: true, items });
  } catch {
    return NextResponse.json({ ok: false, error: "Your recent files didn't load." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const who = await whoIs(req);
  if (!who.actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { ref?: unknown } | null;
  const ref = typeof body?.ref === "string" ? body.ref.trim() : "";
  if (!parseRef(ref)) return NextResponse.json({ ok: false, error: "Not a file." }, { status: 400 });
  await noteRecent(who.actor.id, ref).catch(() => {});
  return NextResponse.json({ ok: true });
}
