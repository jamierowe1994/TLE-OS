import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { bugShot } from "@/lib/pilot";

/**
 * The screen as it looked when somebody reported a problem.
 *
 * GET /api/admin/bug-shot?id=<bugId> → { shot }
 *
 * Its own route, and fetched only when a picture is actually opened. A JPEG is
 * tens of kilobytes and the reports list reads every row — returning them with
 * the list would drag every picture along just to draw a page of text.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!(await requireCapability(req, "see:reports"))) {
    return new NextResponse(null, { status: 404 });
  }
  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  return NextResponse.json({ shot: await bugShot(id) });
}
