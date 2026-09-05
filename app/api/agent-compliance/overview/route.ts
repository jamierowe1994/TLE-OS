import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { overview, verify } from "@/lib/agent-compliance";

/**
 * GET  /api/agent-compliance/overview → every person, every requirement,
 *      where they stand. Michael's screen.
 * POST /api/agent-compliance/overview → { userId, requirementId, seen }
 *      "I have seen it" (or have not). Only somebody with the capability
 *      can say so, which is what makes verified mean something.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const me = await requireCapability(req, "see:agent-compliance");
  if (!me) return NextResponse.json({ ok: false, error: "Not yours." }, { status: 403 });
  if (!hasDb()) return NextResponse.json({ ok: true, stored: false, requirements: [], agents: [] });
  const o = await overview();
  return NextResponse.json({ ok: true, stored: true, ...o });
}

export async function POST(req: NextRequest) {
  const me = await requireCapability(req, "see:agent-compliance");
  if (!me) return NextResponse.json({ ok: false, error: "Not yours." }, { status: 403 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { userId?: string; requirementId?: string; seen?: boolean };
  if (!body.userId || !body.requirementId) return NextResponse.json({ ok: false, error: "Who, and which?" }, { status: 400 });
  await verify({ userId: body.userId, requirementId: body.requirementId, by: me.name || me.email, seen: body.seen !== false });
  const o = await overview();
  return NextResponse.json({ ok: true, ...o });
}
