import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { cleanEntry, writeReadLog, type ReadEntry } from "@/lib/read-log";
import { record } from "@/lib/audit";
import { findUserById } from "@/lib/users";
import { recordBeats } from "@/lib/cron-watch";

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
  /* { entries, alerts, beats } - or a bare list of entries, as the first version sent. */
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as { entries?: unknown; alerts?: unknown; beats?: unknown }) : null;
  /* The Railway timers that reached the OS (lib/cron-watch). */
  await recordBeats(o?.beats).catch(() => 0);
  const list = Array.isArray(raw) ? raw : Array.isArray(o?.entries) ? o.entries : [];
  const entries = list.slice(0, MAX).map(cleanEntry).filter((e): e is ReadEntry => e !== null);
  /* A pace pause (the middleware's PACE): into the audit trail, which is
     where Admin > Activity, the person's file and the owners' bell read it. */
  const alerts = Array.isArray(o?.alerts) ? o.alerts.slice(0, 50) : [];
  for (const a of alerts) {
    const userId = a && typeof a === "object" && typeof (a as { userId?: unknown }).userId === "string" ? (a as { userId: string }).userId.slice(0, 64) : "";
    const detail = typeof (a as { detail?: unknown })?.detail === "string" ? (a as { detail: string }).detail.slice(0, 300) : "";
    if (!userId || (a as { kind?: unknown }).kind !== "reading_paused") continue;
    const who = await findUserById(userId).catch(() => null);
    await record({ kind: "reading_paused", actorId: userId, actorEmail: who?.email ?? "", detail });
  }
  try {
    await writeReadLog(entries);
  } catch (e) {
    console.error(`[read-log] dropped ${entries.length} rows`, e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false }, { status: 503 });
  }
  return NextResponse.json({ ok: true, wrote: entries.length });
}
