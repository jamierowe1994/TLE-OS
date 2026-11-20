import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { can } from "@/lib/roles";
import { isDay, isResponse } from "@/lib/rent-review-rules";
import { getReview, isReviewId, rentReviewOn, updateReview } from "@/lib/rent-reviews";

/**
 * One Scottish rent review, on the compliance desk.
 *
 *   GET                                     everything on it
 *   PATCH { action: "payprop", undo? }      PayProp's invoices amended
 *   PATCH { action: "response", response, date, note }
 *                                           the tenant's answer on Part 3
 *
 * Nothing here sends anything to anybody.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function gate(req: NextRequest) {
  const { actor, viewingAs } = await whoIs(req);
  if (!actor) return { error: NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 }) } as const;
  if (!can(actor.role, "see:agent-compliance")) return { error: NextResponse.json({ ok: false, error: "That's the compliance desk's." }, { status: 403 }) } as const;
  if (!(await rentReviewOn(actor))) return { error: NextResponse.json({ ok: false, error: "The Scottish rent review isn't switched on for you." }, { status: 404 }) } as const;
  return { actor, viewingAs } as const;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await gate(req);
  if ("error" in g) return g.error;
  const { id } = await ctx.params;
  const review = isReviewId(id) ? await getReview(id) : null;
  if (!review) return NextResponse.json({ ok: false, error: "That rent review isn't here." }, { status: 404 });
  return NextResponse.json({ ok: true, review });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await gate(req);
  if ("error" in g) return g.error;
  if (g.viewingAs) return NextResponse.json({ ok: false, error: "You are viewing as somebody else. Switch back to change it." }, { status: 403 });
  const { id } = await ctx.params;
  if (!isReviewId(id) || !(await getReview(id))) return NextResponse.json({ ok: false, error: "That rent review isn't here." }, { status: 404 });
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const by = g.actor.name || g.actor.email;
  if (b?.action === "payprop") {
    return NextResponse.json({ ok: true, review: await updateReview(id, { action: "payprop", undo: b.undo === true }, by) });
  }
  if (b?.action === "response") {
    const response = b.response == null || b.response === "" ? null : isResponse(b.response) ? b.response : undefined;
    if (response === undefined) return NextResponse.json({ ok: false, error: "Which answer did the tenant give?" }, { status: 400 });
    const date = typeof b.date === "string" && isDay(b.date) ? b.date : null;
    if (response && !date) return NextResponse.json({ ok: false, error: "Add the date they answered." }, { status: 400 });
    return NextResponse.json({ ok: true, review: await updateReview(id, { action: "response", response, date, note: String(b.note ?? "").trim() }, by) });
  }
  return NextResponse.json({ ok: false, error: "Nothing to change." }, { status: 400 });
}
