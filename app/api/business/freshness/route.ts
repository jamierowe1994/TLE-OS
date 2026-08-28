import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
/* The BUSINESS seam, not the OS one. lib/db's q() refuses to mutate any table
   not prefixed os_, which is the right rule — and integration_cache and
   propoly_cache are two of the nine ported tables that predate it. This seam
   routes those through qShared with a stated reason and leaves everything
   else to the OS guard. */
import { q } from "@/lib/business/db";

/**
 * When each source last actually answered — and a way to make it answer again.
 *
 * GET  /api/business/freshness → { sources[], oldest }
 * POST /api/business/freshness → forgets the cached copies, so the next read walks
 *
 * James: "we should have it loaded from Propoly, like 17 hours ago or whatever.
 * They should have a manual refresh button where they can force a refresh, just
 * in case they need up-to-date info and we are only running on a cron system."
 *
 * ── Why this reads the CACHE and not the figures ──────────────────────────
 *
 * "How old is this?" is a question about the fetch, not about the number. The
 * figures themselves already carry an `asOf`, but that is stamped at RENDER
 * time — `new Date()` when the tile is built — so it says "now" whether the
 * underlying walk happened a minute ago or last Tuesday. It looks like
 * freshness and measures nothing.
 *
 * The honest answer lives in the durable cache rows, where `computed_at` is
 * written by whoever did the walking. That is the timestamp worth showing.
 *
 * ── Why POST clears rather than re-walks ──────────────────────────────────
 *
 * A refresh that waits for PayProp holds the request open for minutes and
 * usually gets killed. Clearing the durable copies returns immediately, and
 * the next page load does the walk with a progress state the screen already
 * knows how to render ("5 of 8 months ready"). The button's job is to
 * invalidate, not to be the thing that waits.
 *
 * Closed months in `gci_months` are deliberately NOT cleared: they are the
 * archive, they cannot change, and re-walking four years because somebody
 * wanted today's number would be a spectacular own goal.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** The caches a refresh should forget, and what each one feeds. */
const CACHES: Array<{ table: string; label: string; feeds: string }> = [
  { table: "integration_cache", label: "PayProp", feeds: "Income, Arrears, Portfolio" },
  { table: "propoly_cache", label: "Propoly", feeds: "Move-ins and pipeline" },
  { table: "os_cache", label: "REX", feeds: "Leads, Listings, Compliance" },
];

export async function GET(req: NextRequest) {
  if (!(await requireCapability(req, "see:business"))) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const sources: Array<{ label: string; feeds: string; computedAt: string | null }> = [];
  for (const c of CACHES) {
    try {
      /* The NEWEST row: "when did this source last answer at all". The oldest
         would describe one stale key rather than the connection. */
      const rows = await q<{ at: string | null }>(
        `SELECT MAX(computed_at)::text AS at FROM ${c.table}`
      );
      sources.push({ label: c.label, feeds: c.feeds, computedAt: rows[0]?.at ?? null });
    } catch {
      /* A cache table that doesn't exist yet is not an error — it is a source
         that has never been asked. null says exactly that. */
      sources.push({ label: c.label, feeds: c.feeds, computedAt: null });
    }
  }

  const stamps = sources.map((s) => s.computedAt).filter((s): s is string => Boolean(s));
  return NextResponse.json({
    sources,
    /* The oldest is what the header shows — the figures on screen are only as
       fresh as the least fresh thing feeding them. */
    oldest: stamps.length ? stamps.sort()[0] : null,
  });
}

export async function POST(req: NextRequest) {
  if (!(await requireCapability(req, "see:business"))) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const cleared: string[] = [];
  for (const c of CACHES) {
    try {
      await q(`DELETE FROM ${c.table}`);
      cleared.push(c.label);
    } catch {
      /* Missing table, or one the OS doesn't own. Skip it and clear the rest —
         a partial refresh is still a refresh, and reporting which ones went is
         more use than failing the lot. */
    }
  }

  return NextResponse.json({
    ok: true,
    cleared,
    note: "Cleared. The next load walks the sources again — closed months stay archived.",
  });
}
