import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { whoIs } from "@/lib/admin";
import { bondSummary, ownerProvider, postcardProvider, recentActivity, todayPicture } from "@/lib/bond";

/**
 * Today, in one call: the figures, the picture, the feed, who is asking, and
 * which doors are open. `districts` scopes the figures to the person's patch;
 * absent or empty means the whole book.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!hasDb()) {
    return NextResponse.json({ ok: false, reason: "Bond needs the database and this environment has none." }, { status: 503 });
  }
  const districts = (req.nextUrl.searchParams.get("districts") ?? "").split(",").map((d) => d.trim().toUpperCase()).filter((d) => /^[A-Z]{1,2}\d{1,2}[A-Z]?$/.test(d));
  try {
    const [summary, picture, activity, who] = await Promise.all([bondSummary(districts), todayPicture(districts), recentActivity(40), whoIs(req)]);
    const name = (who.subject?.name ?? "").trim().split(/\s+/)[0] || null;
    return NextResponse.json({
      ok: true,
      summary,
      picture,
      activity,
      name,
      providers: { owner: ownerProvider(), postcard: postcardProvider() },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, reason: (e as Error).message }, { status: 502 });
  }
}
