import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { saveViewingFeedback } from "@/lib/viewing-feedback-store";
import { assertNotViewingAs, ViewingAsRefused, VIEW_AS_COOKIE } from "@/lib/view-as";

/**
 * POST → what was said after a viewing (lib/viewing-feedback-store, 15 Sep 2026).
 * Body: { viewingId, attended, choice, label, note, applicant, address, listingId, startsAt }.
 * Recorded under the signed-in agent; never while viewing as somebody, or it
 * would be filed under their name.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    assertNotViewingAs(req.cookies.get(VIEW_AS_COOKIE)?.value);
  } catch (e) {
    if (e instanceof ViewingAsRefused) return NextResponse.json({ ok: false, error: e.message }, { status: 423 });
    throw e;
  }
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const str = (k: string) => (typeof b[k] === "string" ? (b[k] as string).trim() : "");
  const viewingId = str("viewingId");
  if (!viewingId || typeof b.attended !== "boolean") {
    return NextResponse.json({ ok: false, error: "Which viewing, and did they turn up?" }, { status: 400 });
  }
  if (b.attended && !str("choice")) {
    return NextResponse.json({ ok: false, error: "Pick how it landed first." }, { status: 400 });
  }
  try {
    await saveViewingFeedback(
      {
        viewingId,
        attended: b.attended,
        choice: str("choice"),
        label: str("label"),
        note: str("note"),
        applicant: str("applicant"),
        address: str("address"),
        listingId: str("listingId") || null,
        startsAt: str("startsAt") || null,
      },
      { email: actor.email, name: actor.name || actor.email }
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Couldn't save it." }, { status: 500 });
  }
}
