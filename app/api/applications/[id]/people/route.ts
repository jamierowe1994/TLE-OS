import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { letPeople } from "@/lib/let-people";
import { cancellationFor } from "@/lib/let-cancel";

/**
 * GET → who is on a let (lib/let-people), for its page's tenant and landlord
 * drawers and the customer update builder, and whether it was cancelled.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const [r, cancelled] = await Promise.all([letPeople(id, actor), cancellationFor(id)]);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, let: r.let, cancelled });
}
