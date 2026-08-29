import { NextRequest, NextResponse } from "next/server";
import { scopeFor } from "@/lib/scope";
import { cacheKeyFor, heldFor, refresh, FRESH_MS, STALE_MS } from "@/lib/listings-cache";
import { rexConfigured } from "@/lib/rex";

/**
 * The rental book, cached — same two layers as the leads route (memory for
 * speed, os_cache so the first person in after a deploy doesn't pay for
 * everyone) and the same stale-while-revalidate manners.
 *
 * The book changes far more slowly than the lead feed, so it holds longer:
 * a listing added five minutes ago is not the emergency a lead is.
 *
 * The cache itself lives in lib/listings-cache.ts, because the write-up route
 * has to be able to clear it and a route module is the wrong place to keep
 * state another route owns a share of.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!rexConfigured()) {
    return NextResponse.json({
      ok: true,
      live: false,
      reason: "REX isn't connected on this environment — the static export is standing in.",
    });
  }

  /* WHOSE BOOK. Resolved before anything is fetched or read from cache. */
  const scope = await scopeFor(req);
  if (scope.unlinked) {
    return NextResponse.json({
      ok: true,
      live: false,
      unlinked: true,
      reason:
        "We can't tell which REX user you are, so we can't show you your listings — and we won't show you everybody's. Ask James to link your account.",
    });
  }
  const key = cacheKeyFor(scope.rexUserId);

  const held = await heldFor(key);
  const age = held ? Date.now() - held.at : Infinity;

  if (held && age < FRESH_MS) {
    return NextResponse.json({ ok: true, live: true, scope: scope.label, ...held.book, ageMs: age });
  }
  if (held && age < STALE_MS) {
    void refresh(key, scope.rexUserId);
    return NextResponse.json({ ok: true, live: true, scope: scope.label, ...held.book, ageMs: age, stale: true });
  }

  try {
    const fresh = await refresh(key, scope.rexUserId);
    return NextResponse.json({ ok: true, live: true, scope: scope.label, ...fresh.book, ageMs: 0 });
  } catch (e) {
    if (held) return NextResponse.json({ ok: true, live: true, scope: scope.label, ...held.book, ageMs: age, stale: true });
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Couldn't reach REX." },
      { status: 502 }
    );
  }
}
