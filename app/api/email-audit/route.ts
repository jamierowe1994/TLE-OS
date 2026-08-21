import { NextRequest, NextResponse } from "next/server";
import { auditEmails } from "@/lib/email-audit";
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
  if (!rexConfigured()) {
    return NextResponse.json({ error: "REX isn't connected here." }, { status: 503 });
  }
  // Each page is a REX round trip, so this is capped — 25 pages is already a
  // 20-second call and the shape is clear long before then.
  const pages = Math.min(25, Number(req.nextUrl.searchParams.get("pages") ?? 10) || 10);
  try {
    return NextResponse.json(await auditEmails(pages));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
