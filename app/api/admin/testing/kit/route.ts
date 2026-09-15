import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { publicOrigin } from "@/lib/origin";
import { assertNotViewingAs, ViewingAsRefused, VIEW_AS_COOKIE } from "@/lib/view-as";
import { KITS, type KitId } from "@/lib/testing-journeys";
import { clearMyKits, KitRefused, myKits, relinkKit, runKit } from "@/lib/test-kits";

/**
 * Create a test (lib/test-kits, 15 Sep 2026).
 *
 * GET    → the signed-in tester's own tests that have not been cleared.
 * POST   { kit }      → make one, and say what was made and emailed.
 * POST   { relink }   → a fresh landlord portal link for one of their tests.
 * DELETE              → clear everything their tests made.
 *
 * Same door as the Testing page. Never while viewing as somebody: the test is
 * made with the signed-in person's own email, and a test made wearing someone
 * else's face would send their emails to the wrong inbox.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function refusedWhileViewingAs(req: NextRequest): NextResponse | null {
  try {
    assertNotViewingAs(req.cookies.get(VIEW_AS_COOKIE)?.value);
    return null;
  } catch (e) {
    if (e instanceof ViewingAsRefused) return NextResponse.json({ ok: false, error: e.message }, { status: 423 });
    throw e;
  }
}

export async function GET(req: NextRequest) {
  const me = await requireCapability(req, "see:wiring");
  if (!me) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ ok: true, kits: await myKits(me.email).catch(() => []) });
}

export async function POST(req: NextRequest) {
  const me = await requireCapability(req, "see:wiring");
  if (!me) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  const refused = refusedWhileViewingAs(req);
  if (refused) return refused;

  const body = (await req.json().catch(() => ({}))) as { kit?: string; relink?: string };
  try {
    if (typeof body.relink === "string") {
      const url = await relinkKit(body.relink, me, publicOrigin(req));
      return NextResponse.json({ ok: true, url });
    }
    if (typeof body.kit !== "string" || !(body.kit in KITS)) {
      return NextResponse.json({ ok: false, error: "That is not a test we can create." }, { status: 400 });
    }
    const run = await runKit(body.kit as KitId, me, publicOrigin(req));
    return NextResponse.json({ ok: true, run, kits: await myKits(me.email).catch(() => []) });
  } catch (e) {
    const error = e instanceof KitRefused || e instanceof Error ? e.message : "The test could not be made.";
    return NextResponse.json({ ok: false, error }, { status: e instanceof KitRefused ? 409 : 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const me = await requireCapability(req, "see:wiring");
  if (!me) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  const refused = refusedWhileViewingAs(req);
  if (refused) return refused;
  const { cleared } = await clearMyKits(me);
  return NextResponse.json({ ok: true, cleared, kits: [] });
}
