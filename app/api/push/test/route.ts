import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { apnsConfigured } from "@/lib/apns";
import { pushTo } from "@/lib/push";

/**
 * POST /api/push/test
 *
 * One alert to the signed-in person's OWN phones, and nobody else's - so it
 * works with the "phone_alerts" switch off. How James proves the app and the
 * APNs key end to end before arming anything.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  if (!apnsConfigured()) return NextResponse.json({ ok: false, error: "APNs is not set up on this environment." }, { status: 503 });

  const r = await pushTo(actor.id, { title: "TLE OS", body: "Alerts are reaching this phone.", href: "/m" });
  if (!r.sent) {
    return NextResponse.json({ ok: false, error: r.failed.length ? `Apple refused it: ${r.failed.join(", ")}` : "No phone is registered to you yet. Open the app and sign in first." });
  }
  return NextResponse.json({ ok: true, sent: r.sent, failed: r.failed });
}
