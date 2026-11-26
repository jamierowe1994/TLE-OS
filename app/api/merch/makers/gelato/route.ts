import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { checkFromMaker } from "@/lib/merch";

/**
 * POST /api/merch/makers/gelato?key=GELATO_WEBHOOK_KEY
 *
 * Gelato calls this when a merch order changes (order_status_updated,
 * order_item_status_updated, order_item_tracking_code_updated). The address,
 * key included, is set once in Gelato's API Portal under Webhooks.
 *
 * Gelato signs nothing, so nothing in the body is believed: it only names which
 * of our orders to look at again, and the OS then asks Gelato itself
 * (checkFromMaker). Gelato tries three times, five seconds apart, so this
 * always answers 200 once the key matches, even for an order it doesn't know.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function keyOk(req: NextRequest): boolean {
  const secret = process.env.GELATO_WEBHOOK_KEY ?? "";
  const given = req.nextUrl.searchParams.get("key") ?? "";
  if (!secret || !given) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!process.env.GELATO_WEBHOOK_KEY) return NextResponse.json({ ok: false, error: "Not set up" }, { status: 503 });
  if (!keyOk(req)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { orderReferenceId?: unknown; event?: unknown };
  const ref = typeof body.orderReferenceId === "string" ? body.orderReferenceId.slice(0, 80) : "";
  if (!ref) return NextResponse.json({ ok: true, looked: false });
  try {
    const looked = await checkFromMaker(ref);
    return NextResponse.json({ ok: true, looked });
  } catch (e) {
    /* Gelato will try again; the daily check is the backstop either way. */
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
