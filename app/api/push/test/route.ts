import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { pushConfigured, pushTo } from "@/lib/push";

/**
 * POST /api/push/test
 *
 * One alert to the signed-in person's OWN phones, and nobody else's - so it
 * works with the "phone_alerts" switch off. How James proves the app and the
 * keys (APNs for the iPhone app, Web Push for the installed web app) end to
 * end before arming anything.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  if (!pushConfigured()) return NextResponse.json({ ok: false, error: "Phone alerts are not set up on this environment yet." }, { status: 503 });

  const r = await pushTo(actor.id, { title: "TLE OS", body: "Alerts are reaching this phone.", href: "/app" });
  if (!r.sent) {
    return NextResponse.json({ ok: false, error: r.failed.length ? `The push service refused it: ${r.failed.join(", ")}` : "No phone is set up for alerts yet. Turn alerts on in the app first." });
  }
  return NextResponse.json({ ok: true, sent: r.sent, failed: r.failed });
}
