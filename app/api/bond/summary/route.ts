import { NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { bondSummary, ownerProvider, postcardProvider, recentActivity } from "@/lib/bond";

/** Today, in one call: the figures, the feed, and which doors are open. */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  if (!hasDb()) {
    return NextResponse.json({ ok: false, reason: "Bond needs the database and this environment has none." }, { status: 503 });
  }
  try {
    const [summary, activity] = await Promise.all([bondSummary(), recentActivity(40)]);
    return NextResponse.json({
      ok: true,
      summary,
      activity,
      providers: { owner: ownerProvider(), postcard: postcardProvider() },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, reason: (e as Error).message }, { status: 502 });
  }
}
