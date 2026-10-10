import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { timingSafeEqual } from "node:crypto";
import { syncOne } from "@/lib/flatfair-sync";

/**
 * Flatfair's webhook (29 Sep 2026). Flatfair POSTs
 *   { type: "flatbond_update", flatbond_id, organization_id }
 * whenever a flatbond changes. The call is not signed, so:
 *
 *   - the URL we give Flatfair carries our secret: ?key=<FLATFAIR_WEBHOOK_SECRET>.
 *     No secret set here means every call is refused.
 *   - nothing in the body is taken as fact. The id is a pointer; the flatbond
 *     is read fresh from Flatfair's API with our own token and stored from
 *     that answer.
 *
 * Answers 200 quickly whatever the refresh does - a slow or failed read is
 * logged and the next sync catches it - so Flatfair never retries a storm.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function keyOk(req: NextRequest): boolean {
  const secret = process.env.FLATFAIR_WEBHOOK_SECRET ?? "";
  const given = req.nextUrl.searchParams.get("key") ?? "";
  if (!secret || !given) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!process.env.FLATFAIR_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false, error: "Not set up here." }, { status: 503 });
  }
  if (!keyOk(req)) return NextResponse.json({ ok: false, error: "Not recognised." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { type?: string; flatbond_id?: unknown } | null;
  const id = Number(body?.flatbond_id);
  if (body?.type !== "flatbond_update" || !Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ ok: true, ignored: true });
  }
  const out = await syncOne(id).catch((e) => ({ ok: false, error: publicError(e, "failed") }));
  return NextResponse.json({ ok: true, refreshed: out.ok });
}
