import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { isOwnTestTarget } from "@/lib/practice-target";

/**
 * "Does this write name one of my own test files?" - asked by the middleware
 * for an area on practice (lib/area-map). The ids are whatever the refused
 * request carried; the answer is about the ACTOR, never a view-as subject.
 * Anything wrong, anything missing: false, and the write stays refused.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, test: false }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { ids?: unknown };
  const ids = Array.isArray(b.ids) ? b.ids.filter((v): v is string => typeof v === "string") : [];
  return NextResponse.json({ ok: true, test: await isOwnTestTarget(actor.email, ids) });
}
