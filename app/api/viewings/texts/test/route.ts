import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { requireCapability } from "@/lib/admin";
import { sendTestText } from "@/lib/viewing-texts";

/**
 * One test reminder text to a number an owner types, so the real thing can be
 * read on a real phone before the switch goes on. Owners, or the cron key
 * (so it can be run from a terminal). See sendTestText in lib/viewing-texts.
 *
 *   POST { "to": "07..." }
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cronAuthorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  const given = req.headers.get("x-cron-key") ?? "";
  if (!secret || given.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}

export async function POST(req: NextRequest) {
  const owner = await requireCapability(req, "see:everything");
  if (!owner && !cronAuthorised(req)) return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { to?: string };
  const r = await sendTestText(String(body.to ?? ""));
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
