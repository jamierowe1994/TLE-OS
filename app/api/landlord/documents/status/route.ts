import { NextResponse } from "next/server";
import { currentLandlord } from "@/lib/landlord-account";
import { loadLandlordDocuments } from "@/lib/landlord-documents-view";
import { hasDb } from "@/lib/db";

/**
 * How much is in, for the desktop to watch while the phone is being used.
 *
 * A landlord holding the QR code up to their phone is not looking at the
 * computer, and when they put the phone down the screen behind them should
 * already have caught up. Polled every few seconds by QrHandoff only while its
 * code is alive, so nothing is asking when nobody is sending.
 *
 * Counts and titles only: this is the signed-in landlord's own session, so it
 * COULD return the files, but nothing on the desktop needs them and a poller
 * that ships documents every four seconds is a poller somebody will one day
 * point at a log.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const me = await currentLandlord();
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });

  const d = await loadLandlordDocuments(me, new URL(req.url).searchParams.get("p"));
  return NextResponse.json({
    ok: true,
    have: d.progress.have,
    total: d.progress.total,
    sent: d.sent.length,
    needed: d.needed.map((r) => r.title),
  });
}
