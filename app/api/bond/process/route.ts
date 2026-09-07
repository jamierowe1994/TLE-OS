import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { bondProcess, PROCESS_STEPS } from "@/lib/bond-process";

/**
 * The six-step process and where every door in the patch stands on it.
 * `districts` scopes it to the person's patch; absent means the whole book.
 * Read-only, derived from what happened - see lib/bond-process.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!hasDb()) {
    return NextResponse.json({ ok: false, reason: "Bond needs the database and this environment has none." }, { status: 503 });
  }
  const districts = (req.nextUrl.searchParams.get("districts") ?? "")
    .split(",")
    .map((d) => d.trim().toUpperCase())
    .filter((d) => /^[A-Z]{1,2}\d{1,2}[A-Z]?$/.test(d));
  try {
    const funnel = await bondProcess(districts);
    return NextResponse.json({ ok: true, steps: PROCESS_STEPS, ...funnel });
  } catch (e) {
    return NextResponse.json({ ok: false, reason: (e as Error).message }, { status: 502 });
  }
}
