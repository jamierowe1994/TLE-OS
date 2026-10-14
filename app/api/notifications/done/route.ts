import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { markDone } from "@/lib/notifications";

/**
 * POST /api/notifications/done { id, done } → tick (or untick) a line on the
 * dashboard's Needs attention. Kept against the actor, like the read marker,
 * so ticking while viewing as somebody else never clears their list.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { id?: unknown; done?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  if (!id || id.length > 200) return NextResponse.json({ ok: false, error: "Which line?" }, { status: 400 });
  try {
    await markDone(actor.id, id, body?.done !== false);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "That didn't save. Try again." }, { status: 500 });
  }
}
