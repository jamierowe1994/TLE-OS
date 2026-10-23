import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { lookFor } from "@/lib/new-look-store";
import { ALL_OFF } from "@/lib/new-look";

/**
 * GET → which screens the signed-in person sees in the new look.
 *
 * The ACTOR, not a view-as subject, the same as the area switches: an owner
 * looking through an agent's eyes is still the one who chose to see it.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, on: ALL_OFF }, { status: 401 });
  const on = await lookFor(actor).catch(() => ({ ...ALL_OFF }));
  return NextResponse.json({ ok: true, on }, { headers: { "cache-control": "private, no-store" } });
}
