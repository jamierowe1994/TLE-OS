import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { TEST_REFUSAL } from "@/lib/test-listing-answers";
import { isTestId } from "@/lib/test-overlay";
import { whoIs } from "@/lib/admin";
import { listingIsTheirs } from "@/lib/listing-gate";
import { relist } from "@/lib/listings-taken";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Relist: a listing whose deal fell through counts as available again
 * (lib/listings-taken, 12 Oct 2026). The OS's own fact - the advert is not
 * touched. Evidence from before the press stops counting; a new offer or
 * deal after it takes the listing again.
 */
export async function POST(req: NextRequest) {
  const { actor, subject } = await whoIs(req);
  const me = subject ?? actor;
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { id?: string };
  const id = String(body.id ?? "").trim();
  if (isTestId(id)) return NextResponse.json({ ok: false, error: TEST_REFUSAL, test: true }, { status: 409 });
  if (!/^\d+$/.test(id)) return NextResponse.json({ ok: false, error: "Which listing?" }, { status: 400 });
  const notTheirs = await listingIsTheirs(me, Number(id));
  if (notTheirs) return NextResponse.json({ ok: false, error: notTheirs }, { status: 403 });
  try {
    await relist(id, me.email || me.name || null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "Couldn't save that.") }, { status: 500 });
  }
}
