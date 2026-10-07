import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { can } from "@/lib/roles";
import { hasDb, q } from "@/lib/db";
import { clearDecision, isDecisionRef, recordDecision } from "@/lib/offer-decisions";
import { assertNotViewingAs, ViewingAsRefused, VIEW_AS_COOKIE } from "@/lib/view-as";

/**
 * POST /api/offers/decide { ref, listingId?, decision: "accepted" | "declined" | "undo" }
 *
 * The agent's Accept or Decline on an offer (7 Oct 2026, James). Kept in the
 * OS only (lib/offer-decisions) - nothing here writes to REX, and the tenant
 * and landlord are not told automatically. Test offers go through
 * /api/applications/<id>/test instead, so their file keeps its own status.
 *
 * An OS offer's listing is read from the offer itself, not taken from the
 * request; a REX application's comes from the page and only groups it.
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
  const { actor } = await whoIs(req).catch(() => ({ actor: null }));
  if (!actor || !can(actor.role, "staff:internal")) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "This can't be saved on this environment." }, { status: 503 });

  const b = (await req.json().catch(() => ({}))) as { ref?: unknown; listingId?: unknown; decision?: unknown };
  if (!isDecisionRef(b.ref)) return NextResponse.json({ ok: false, error: "Which offer?" }, { status: 400 });
  const ref = b.ref;
  const decision = b.decision;
  if (decision !== "accepted" && decision !== "declined" && decision !== "undo") {
    return NextResponse.json({ ok: false, error: "Accept, decline or undo." }, { status: 400 });
  }

  let listingId: string | null = /^-?\d{1,12}$/.test(String(b.listingId ?? "")) ? String(b.listingId) : null;
  if (ref.startsWith("os:")) {
    const row = await q<{ listing_id: string | null }>(
      `SELECT listing_id FROM os_tenant_viewing_responses WHERE id = $1 AND kind = 'offer'`,
      [ref.slice(3)]
    ).catch(() => []);
    if (!row[0]) return NextResponse.json({ ok: false, error: "That offer isn't there any more." }, { status: 404 });
    listingId = row[0].listing_id;
  }

  try {
    if (decision === "undo") await clearDecision(ref);
    else await recordDecision({ ref, listingId, decision, by: { name: actor.name || actor.email, email: actor.email } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("offer decision failed", e);
    return NextResponse.json({ ok: false, error: "That didn't save. Try again." }, { status: 500 });
  }
}
