import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { whoIs } from "@/lib/admin";
import { listContractors, saveContractor, type Contractor } from "@/lib/works-orders";

/** The trades book: who gets the works order. Any member of staff can add to it. */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: true, contractors: [] });
  return NextResponse.json({ ok: true, contractors: await listContractors() });
}

export async function POST(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const b = (await req.json().catch(() => null)) as Partial<Contractor> | null;
  if (!b?.name?.trim() || !b.trade?.trim()) return NextResponse.json({ ok: false, error: "A contractor needs a name and a trade." }, { status: 400 });
  try {
    const contractor = await saveContractor({ ...b, name: b.name, trade: b.trade });
    return NextResponse.json({ ok: true, contractor });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Could not save." }, { status: 400 });
  }
}
