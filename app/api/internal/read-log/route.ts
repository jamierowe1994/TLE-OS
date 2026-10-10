import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { cleanEntry, writeReadLog, type ReadEntry } from "@/lib/read-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Where the middleware hands over its batch of calls for the read log
 * (lib/read-log). Exempt from the door, because the middleware itself is the
 * caller; so the batch must carry an HMAC of its body under AUTH_SECRET, which
 * only the server holds. Anything else is a 404.
 */
const MAX = 2_000;

function secret(): string | null {
  return process.env.AUTH_SECRET || (process.env.NODE_ENV !== "production" ? "dev-only-secret-not-for-production" : null);
}

export async function POST(req: NextRequest) {
  const key = secret();
  const body = await req.text();
  const sig = req.headers.get("x-os-log-sig") ?? "";
  if (!key || body.length > 1_500_000) return new NextResponse(null, { status: 404 });
  const want = Buffer.from(crypto.createHmac("sha256", key).update(`read-log.${body}`).digest("base64url"));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return new NextResponse(null, { status: 404 });

  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const entries = (Array.isArray(raw) ? raw.slice(0, MAX) : []).map(cleanEntry).filter((e): e is ReadEntry => e !== null);
  try {
    await writeReadLog(entries);
  } catch (e) {
    console.error(`[read-log] dropped ${entries.length} rows`, e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false }, { status: 503 });
  }
  return NextResponse.json({ ok: true, wrote: entries.length });
}
