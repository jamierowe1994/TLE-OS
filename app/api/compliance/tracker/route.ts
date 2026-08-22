import { NextResponse } from "next/server";
import { getComplianceBook } from "@/lib/compliance-cache";
import { buildQueue, buildTracker } from "@/lib/compliance-tracker";
import { COMP_BOOK } from "@/lib/compliance";
import { rexConfigured } from "@/lib/rex";

/**
 * GET /api/compliance/tracker → what is outstanding, what is coming, who to chase.
 *
 * Shares the compliance cache with /api/compliance, so opening Michael's
 * tracker after the compliance page costs nothing.
 *
 * Read-only and unable to send by construction — see lib/compliance-tracker.
 * The queue is a list, not an outbox.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  // Without REX the sample book still exercises every code path, which is what
  // makes this developable. Flagged as not live so nobody quotes the numbers.
  if (!rexConfigured()) {
    const tracker = buildTracker(COMP_BOOK);
    return NextResponse.json({
      ok: true,
      live: false,
      reason: "REX isn't connected here — the sample book is standing in.",
      ...tracker,
      queue: buildQueue(tracker),
    });
  }

  try {
    const { book, ageMs, stale } = await getComplianceBook();
    const tracker = buildTracker(book.properties);
    return NextResponse.json({
      ok: true,
      live: true,
      ageMs,
      ...(stale ? { stale: true } : {}),
      ...tracker,
      queue: buildQueue(tracker),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Couldn't reach REX." },
      { status: 502 }
    );
  }
}
