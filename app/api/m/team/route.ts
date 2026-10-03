import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { colleagues } from "@/lib/chats";

/**
 * GET /api/m/team - Find Your Local Agents (3 Oct 2026): everyone on the
 * team, nearest first by the patch each of them set, then the rest by name.
 * Only a name, a photo and a TOWN go out - never where anyone lives.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "The team is not on this environment." }, { status: 503 });
  const { mine, people } = await colleagues(actor);
  return NextResponse.json({ ok: true, patch: mine ? { town: mine.town, area: mine.area } : null, people });
}
