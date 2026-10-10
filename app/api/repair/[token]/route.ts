import { NextRequest, NextResponse } from "next/server";
import { asText, jsonObject } from "@/lib/json-body";
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
  const b = await jsonObject(req);
  if (b.happy !== "yes" && b.happy !== "no") return NextResponse.json({ ok: false, error: "Yes or no?" }, { status: 400 });
  /* Asked once the work is done, answered once (Rig run 4, P-047, 10 Oct
     2026). The link took a yes, then a no, then a yes, for ever, on jobs
     that were not even finished, and a note of any size - two million
     characters went onto one job's history. */
  if (o.status === "cancelled" || !(o.completedAt || ["done", "invoiced", "paid"].includes(o.status))) {
    return NextResponse.json({ ok: false, error: "We'll ask you once the work is finished." }, { status: 400 });
  }
  if (o.tenantHappy) {
    return NextResponse.json({ ok: false, error: "Thanks - you've already told us. If anything has changed, reply to our email.", happy: o.tenantHappy }, { status: 409 });
  }
  const next = await moveOrder(o.id, { action: "tenant_happy", happy: b.happy, note: asText(b.note).trim().slice(0, 2000) }, o.tenant.trim() || "The tenant");
  return NextResponse.json({ ok: true, happy: next.tenantHappy });
}
