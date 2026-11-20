import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { can } from "@/lib/roles";
import { hasDb } from "@/lib/db";
import { rentReviewOn, saveRentReviewSettings } from "@/lib/rent-reviews";

/**
 * PUT { agentAddress } -> the office address every Scottish rent-increase
 * notice starts with as the landlord's agent (lib/rent-reviews). The office
 * only; an agent can still change it on one notice.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PUT(req: NextRequest) {
  const { actor, viewingAs } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (viewingAs) return NextResponse.json({ ok: false, error: "You are viewing as somebody else. Switch back to change it." }, { status: 403 });
  if (!can(actor.role, "see:everything")) return NextResponse.json({ ok: false, error: "Only the office changes the default." }, { status: 403 });
  if (!(await rentReviewOn(actor))) return NextResponse.json({ ok: false, error: "The Scottish rent review isn't switched on for you." }, { status: 404 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const b = (await req.json().catch(() => null)) as { agentAddress?: unknown } | null;
  const address = String(b?.agentAddress ?? "").trim();
  if (address.length < 8) return NextResponse.json({ ok: false, error: "Add the office's full address." }, { status: 400 });
  await saveRentReviewSettings(address, actor.email);
  return NextResponse.json({ ok: true, agentAddress: address });
}
