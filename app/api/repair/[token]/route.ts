import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { orderByToken, moveOrder } from "@/lib/works-orders";

/**
 * The tenant's one question: was it sorted? Reached by the token in their
 * "are you happy?" email. A no goes on the job, in red, for the agent.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const o = await orderByToken("tenant", token);
  if (!o) return NextResponse.json({ ok: false, error: "That link isn't one of ours." }, { status: 404 });
  return NextResponse.json({ ok: true, job: { ref: o.ref, title: o.title, address: [o.propertyName, o.locality].filter(Boolean).join(", "), contractorName: o.contractorName, happy: o.tenantHappy, done: Boolean(o.completedAt) } });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const o = await orderByToken("tenant", token);
  if (!o || !hasDb()) return NextResponse.json({ ok: false, error: "That link isn't one of ours." }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as { happy?: string; note?: string };
  if (b.happy !== "yes" && b.happy !== "no") return NextResponse.json({ ok: false, error: "Yes or no?" }, { status: 400 });
  const next = await moveOrder(o.id, { action: "tenant_happy", happy: b.happy, note: (b.note ?? "").trim() }, o.tenant.trim() || "The tenant");
  return NextResponse.json({ ok: true, happy: next.tenantHappy });
}
