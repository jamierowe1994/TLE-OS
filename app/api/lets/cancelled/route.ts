import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { allCancellations } from "@/lib/let-cancel";

/** GET → the lets cancelled from their page, so the Applications board can leave them off. */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const list = await allCancellations();
  return NextResponse.json({ ok: true, refs: list.map((c) => c.ref), deals: list.map((c) => c.dealId).filter(Boolean) });
}
