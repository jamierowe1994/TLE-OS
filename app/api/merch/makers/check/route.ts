import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { checkOpenOrders } from "@/lib/merch";

/**
 * POST /api/merch/makers/check   (x-cron-key: CRON_SECRET, or an owner)
 *
 * Asks Clothes2Order and Prodigi how each merch order still being made is
 * doing, once a day in the early morning run (Clothes2Order dispatches by 8pm
 * and asks for no more than a check a day). Orders that have gone out are
 * never asked about again. Nothing is sent anywhere by this.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cronAuthorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  const given = req.headers.get("x-cron-key") ?? "";
  if (!secret || !given) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!cronAuthorised(req) && !(await requireCapability(req, "manage:switches"))) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  try {
    const out = await checkOpenOrders();
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}

export const GET = POST;
