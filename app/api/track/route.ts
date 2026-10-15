import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { trackTime, trackView } from "@/lib/pilot";

/**
 * "I opened this page", and "I was on it this long" (components/PageTracker).
 *
 * Records the ACTOR, not the subject: an owner viewing as Rhiannon is testing,
 * not using, and counting it as her usage would make the pilot's own numbers
 * fiction. The whole reason this table exists is to find out what agents
 * really touch.
 *
 * A view is `{ path }`. A time is `{ path, seconds, first }`, sent when the
 * page is left or hidden - by sendBeacon, so it arrives as text/plain or JSON;
 * both are read the same way.
 *
 * Answers 204 always. A tracking call that can fail visibly is a tracking call
 * that will one day break a page.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { actor, viewingAs } = await whoIs(req);
    const body = JSON.parse(await req.text()) as { path?: unknown; seconds?: unknown; first?: unknown };
    const path = typeof body.path === "string" ? body.path.slice(0, 300) : "";
    if (actor && path.startsWith("/") && !viewingAs) {
      if (typeof body.seconds === "number" && Number.isFinite(body.seconds)) {
        await trackTime(actor.id, path, body.seconds, body.first === true);
      } else {
        await trackView(actor.id, path);
      }
    }
  } catch {
    /* never surfaced */
  }
  return new NextResponse(null, { status: 204 });
}
