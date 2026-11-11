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

/* The list as last built, per person and book, for a minute (9 Nov 2026).
   Building it reads every book a recent file could be in - 1.6 s at the
   median last week - and Search opened it on every ⌘K. A file opened (POST)
   empties that person's, so it is always at the top straight away. */
const HOLD_MS = 60_000;
const G = globalThis as { __osRecentLists?: Map<string, { at: number; items: Awaited<ReturnType<typeof recentFor>> }> };
const held = (G.__osRecentLists ??= new Map());

export async function GET(req: NextRequest) {
  const who = await whoIs(req);
  if (!who.actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const scope = await scopeFor(req);
  const rexUserId = await searchScope(req, scope);
  if (rexUserId === false) return NextResponse.json({ ok: true, items: [] });
  const me = who.subject ?? who.actor;
  const key = `${who.actor.id}|${rexUserId ?? "all"}|${me.email ?? ""}`;
  const hit = held.get(key);
  if (hit && Date.now() - hit.at < HOLD_MS) return NextResponse.json({ ok: true, items: hit.items });
  try {
    const items = await recentFor(who.actor.id, { rexUserId, me: { name: me.name ?? "", email: me.email ?? "" }, tester: who.actor.email ?? null });
    if (held.size > 500) held.clear();
    held.set(key, { at: Date.now(), items });
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
  for (const k of [...held.keys()]) if (k.startsWith(`${who.actor.id}|`)) held.delete(k);
  return NextResponse.json({ ok: true });
}
