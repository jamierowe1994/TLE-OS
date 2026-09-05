import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { listRequirements, retireRequirement, saveRequirement } from "@/lib/agent-compliance";
import type { Requirement } from "@/lib/agent-compliance-types";

/**
 * The list that defines "compliant" for an agent - Michael's to write.
 *
 *   GET    /api/agent-compliance/requirements          → { requirements } (active and retired)
 *   POST   /api/agent-compliance/requirements          { id?, title, what, kind, howLink, renewsMonths, required, position }
 *   DELETE /api/agent-compliance/requirements?id=...   → retires it; what agents recorded stays
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const me = await requireCapability(req, "see:agent-compliance");
  if (!me) return NextResponse.json({ ok: false, error: "Not yours." }, { status: 403 });
  if (!hasDb()) return NextResponse.json({ ok: true, stored: false, requirements: [] });
  return NextResponse.json({ ok: true, stored: true, requirements: await listRequirements(true) });
}

export async function POST(req: NextRequest) {
  const me = await requireCapability(req, "see:agent-compliance");
  if (!me) return NextResponse.json({ ok: false, error: "Not yours." }, { status: 403 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as Partial<Requirement>;
  if (!body.title || !body.title.trim()) return NextResponse.json({ ok: false, error: "It needs a name." }, { status: 400 });
  const saved = await saveRequirement({ ...body, title: body.title }, me.name || me.email);
  return NextResponse.json({ ok: true, requirement: saved, requirements: await listRequirements(true) });
}

export async function DELETE(req: NextRequest) {
  const me = await requireCapability(req, "see:agent-compliance");
  if (!me) return NextResponse.json({ ok: false, error: "Not yours." }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "Which one?" }, { status: 400 });
  await retireRequirement(id, me.name || me.email);
  return NextResponse.json({ ok: true, requirements: await listRequirements(true) });
}
