import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { whoIs } from "@/lib/admin";
import { can } from "@/lib/roles";
import { inspectionRules, saveInspectionRules, type InspectionRules } from "@/lib/inspections";

/**
 * The cadence, as a settings document.
 *
 * How often a home is visited is a company decision, not a code decision -
 * three months then every six is a sensible guess and Michael has the final
 * word. It lives here so his answer is a form on a screen rather than a
 * deploy, and so the board can say which rules it is counting by.
 *
 * READ by anyone signed in - every agent's board depends on it. CHANGED by
 * whoever holds compliance or runs the business.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const rules = await inspectionRules();
  return NextResponse.json({ ok: true, rules, canEdit: can(actor.role, "see:agent-compliance") || can(actor.role, "see:business") });
}

export async function PUT(req: NextRequest) {
  const { actor, subject } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!can(actor.role, "see:agent-compliance") && !can(actor.role, "see:business")) {
    return NextResponse.json({ ok: false, error: "Changing how often we inspect isn't yours to set." }, { status: 403 });
  }
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const patch = (await req.json().catch(() => null)) as Partial<InspectionRules> | null;
  if (!patch) return NextResponse.json({ ok: false, error: "Nothing to change." }, { status: 400 });
  const by = (subject ?? actor).name || (subject ?? actor).email;
  const rules = await saveInspectionRules(patch, by);
  return NextResponse.json({ ok: true, rules });
}
