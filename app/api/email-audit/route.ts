import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { auditEmails } from "@/lib/email-audit";
import { requireAnyCapability } from "@/lib/admin";
import { rexConfigured } from "@/lib/rex";

/**
 * GET /api/email-audit?pages=10 → what has gone out, and whether it landed.
 *
 * Read-only by nature. Nothing here can send, stop or edit an email — this
 * answers "what is going out under our name", which is the question that had
 * to be answered before anybody could sensibly turn anything off.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  /* The whole company's send log (Rig run 2, P-008): Susan's and Francesca's,
     not every agent's. It answered anybody signed in. */
  if (!(await requireAnyCapability(req, ["see:business", "see:marketing"]))) {
    return NextResponse.json({ error: "This is the company's whole email log, so it is for the owners and marketing." }, { status: 403 });
  }
  if (!rexConfigured()) {
    return NextResponse.json({ error: "REX isn't connected here." }, { status: 503 });
  }
  // Each page is a REX round trip, so this is capped — 25 pages is already a
  // 20-second call and the shape is clear long before then.
  const pages = Math.min(25, Number(req.nextUrl.searchParams.get("pages") ?? 10) || 10);
  try {
    return NextResponse.json(await auditEmails(pages));
  } catch (e) {
    return NextResponse.json({ error: publicError(e) }, { status: 502 });
  }
}
