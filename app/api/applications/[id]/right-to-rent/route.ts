import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { rtrFor, rtrLet } from "@/lib/application-rtr";

/**
 * GET → the right to rent expiry recorded for each tenant on a let
 * (lib/application-rtr), for the let's own page. Only for somebody who may
 * open the let - the same rule as its people.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const got = await rtrLet(id, actor);
  if (!got.ok) return NextResponse.json({ ok: false, error: got.error }, { status: 403 });
  if (got.scottish) return NextResponse.json({ ok: true, scottish: true, records: [] });
  const records = await rtrFor(id).catch(() => null);
  if (!records) return NextResponse.json({ ok: false, error: "The right to rent dates couldn't be read just now." }, { status: 502 });
  return NextResponse.json({ ok: true, scottish: false, records });
}
