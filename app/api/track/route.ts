import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { trackView } from "@/lib/pilot";

/**
 * "I opened this page."
 *
 * Records the ACTOR, not the subject: an owner viewing as Rhiannon is testing,
 * not using, and counting it as her usage would make the pilot's own numbers
 * fiction. The whole reason this table exists is to find out what agents
 * really touch.
 *
 * Answers 204 always. A tracking call that can fail visibly is a tracking call
 * that will one day break a page.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { actor, viewingAs } = await whoIs(req);
    const { path } = (await req.json()) as { path?: string };
    if (actor && path && !viewingAs) await trackView(actor.id, path);
  } catch {
    /* never surfaced */
  }
  return new NextResponse(null, { status: 204 });
}
