import { NextResponse } from "next/server";
import { getComplianceBook } from "@/lib/compliance-cache";
import { rexConfigured } from "@/lib/rex";

/**
 * The compliance book, live from REX.
 *
 * The caching lives in `lib/compliance-cache` so Michael's tracker can share
 * it rather than starting a second thirty-second sweep of the slowest service
 * we talk to.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  if (!rexConfigured()) {
    return NextResponse.json({
      ok: true,
      live: false,
      reason: "REX isn't connected here — the sample book is standing in.",
    });
  }
  try {
    const { book, ageMs, stale } = await getComplianceBook();
    return NextResponse.json({ ok: true, live: true, ...book, ageMs, ...(stale ? { stale: true } : {}) });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Couldn't reach REX." },
      { status: 502 }
    );
  }
}
