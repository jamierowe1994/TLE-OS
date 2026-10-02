import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { registerDevice } from "@/lib/push";

/**
 * POST /api/push/register  { token, platform, env, appVersion }
 *
 * The iPhone app calls this from inside its own web view once somebody is
 * signed in, so the session cookie says whose phone it is. Always the ACTOR:
 * an owner viewing as an agent must not route that agent's alerts to the
 * owner's pocket.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { token?: string; platform?: string; env?: string; appVersion?: string };
  const token = String(body.token ?? "").trim().toLowerCase();
  /* An APNs token is hex, 64 characters today; allow for Apple lengthening it. */
  if (!/^[0-9a-f]{32,200}$/.test(token)) return NextResponse.json({ ok: false, error: "That is not a device token." }, { status: 400 });

  await registerDevice(actor.id, {
    token,
    platform: body.platform === "android" ? "android" : "ios",
    env: body.env === "sandbox" ? "sandbox" : "production",
    appVersion: String(body.appVersion ?? "").slice(0, 40),
  });
  return NextResponse.json({ ok: true });
}
