import { NextRequest, NextResponse } from "next/server";
import { requireCapability, whoIs } from "@/lib/admin";
import { getBrief, setBrief, BRIEF_MAX } from "@/lib/assistant-brief";

/**
 * The assistant's standing brief.
 *
 * GET → the current brief
 * PUT → replace it
 *
 * Behind `see:business`, the same capability that guards the knowledge base —
 * this is the other half of what the assistant says, and it would be odd for
 * the facts to be locked and the instructions open.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!(await requireCapability(req, "see:business"))) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  return NextResponse.json({ brief: await getBrief(), max: BRIEF_MAX });
}

export async function PUT(req: NextRequest) {
  if (!(await requireCapability(req, "see:business"))) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { body?: unknown };
  if (typeof body.body !== "string") {
    return NextResponse.json({ error: "Expected a body string." }, { status: 400 });
  }
  /* The ACTOR, not the subject — if James is viewing as somebody else, the
     brief was still written by James. */
  const who = await whoIs(req);
  return NextResponse.json({ brief: await setBrief(body.body, who.actor?.email ?? "") });
}
