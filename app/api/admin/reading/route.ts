import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/admin";
import { FLAG, readersToday, readingOf } from "@/lib/read-log-summary";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The read log, for owners (10 Oct 2026, lib/read-log).
 *   GET              everybody who read anything in the last 24 hours
 *   GET ?user=<id>   one person's counts and the last things they opened
 */
export async function GET(req: NextRequest) {
  if (!(await requireOwner(req))) return new NextResponse(null, { status: 404 });
  const user = req.nextUrl.searchParams.get("user");
  try {
    if (user) return NextResponse.json({ ok: true, reading: await readingOf(user), flag: FLAG });
    return NextResponse.json({ ok: true, readers: await readersToday(), flag: FLAG });
  } catch (e) {
    console.error("[reading]", e);
    return NextResponse.json({ ok: false, error: "We couldn't read the log just now." }, { status: 500 });
  }
}
