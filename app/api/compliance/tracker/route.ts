import { NextResponse } from "next/server";
import { getComplianceBook } from "@/lib/compliance-cache";
import { buildQueue, buildTracker } from "@/lib/compliance-tracker";
import { COMP_BOOK } from "@/lib/compliance";
import { rexConfigured } from "@/lib/rex";
import { hasDb, q } from "@/lib/db";

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

/**
 * Which chases have actually gone, to whom and when.
 *
 * "If the renewals are coming up, he will need to check that they've been
 * emailed and followed up on" (James, 20 Sep 2026). The send log has held this
 * since the chase was built; no screen read it. Null, not an empty list, when
 * it cannot be read - "nobody has been emailed" and "we could not look" are
 * different answers and he would act on the first.
 */
async function chaseLog(): Promise<{ key: string; to: string; at: string }[] | null> {
  if (!hasDb()) return null;
  try {
    const rows = await q<{ chase_key: string; sent_to: string; sent_at: Date }>(
      `SELECT chase_key, sent_to, sent_at FROM os_compliance_chases_sent ORDER BY sent_at DESC LIMIT 2000`
    );
    return rows.map((r) => ({ key: r.chase_key, to: r.sent_to, at: new Date(r.sent_at).toISOString() }));
  } catch {
    return null;
  }
}

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
      chases: await chaseLog(),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Couldn't reach REX." },
      { status: 502 }
    );
  }
}
