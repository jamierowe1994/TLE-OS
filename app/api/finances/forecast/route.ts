import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { can } from "@/lib/roles";
import { feeBasis, forecastFor, saveFeeBasis, saveTarget, type FeeBasis } from "@/lib/finance-forecast";

/**
 * The Finances board's figures: how the book has grown, what it earns at the
 * rates we charge, and where that lands against what somebody wants.
 *
 * GET  → the trailing year, the year ahead, growth and the target.
 * PUT  → the rates (company-wide, owners only) and the target (your own).
 *
 * Scoped like every other board: an agent forecasts their own book, an owner
 * the whole business.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const { actor, subject } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const me = subject ?? actor;
  /* An owner sees the whole business; everybody else sees their own book. */
  const scope = can(actor.role, "see:business") ? null : me.rexUserId;
  const answer = await forecastFor(scope, me.id);
  return NextResponse.json({ ok: true, ...answer, whole: scope === null, canSetRates: can(actor.role, "see:business") });
}

export async function PUT(req: NextRequest) {
  const { actor, subject } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const me = subject ?? actor;
  const body = (await req.json().catch(() => null)) as { basis?: Partial<FeeBasis>; annualTargetPence?: number | null } | null;
  if (!body) return NextResponse.json({ ok: false, error: "Nothing to save." }, { status: 400 });

  /* The rates are what the company charges, so they are not an agent's to
     change; the target is personal and always theirs. */
  if (body.basis) {
    if (!can(actor.role, "see:business")) return NextResponse.json({ ok: false, error: "The rates are set by an owner." }, { status: 403 });
    await saveFeeBasis(body.basis);
  }
  if (body.annualTargetPence !== undefined) await saveTarget(me.id, body.annualTargetPence);
  return NextResponse.json({ ok: true, basis: await feeBasis() });
}
