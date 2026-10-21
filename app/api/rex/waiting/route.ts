import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { waitingFor } from "@/lib/rex-queue";
import { rexIsDown } from "@/lib/rex-outage";

/**
 * How many changes to a record are waiting for REX (21 Oct 2026,
 * lib/rex-queue). GET ?ref=listing:123&ref=property:456 → { n, down }.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ n: 0, down: false });
  const refs = req.nextUrl.searchParams.getAll("ref").slice(0, 6);
  let n = 0;
  for (const ref of refs) {
    const i = ref.indexOf(":");
    if (i < 1) continue;
    n += await waitingFor(ref.slice(0, i), ref.slice(i + 1));
  }
  return NextResponse.json({ n, down: await rexIsDown() });
}
