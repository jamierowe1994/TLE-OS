import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { forgetWebSubscription, registerWebSubscription } from "@/lib/push";

/**
 * GET    /api/push/subscribe → the public key a browser subscribes with
 * POST   /api/push/subscribe { endpoint, keys: { p256dh, auth } } → alerts on for this phone
 * DELETE /api/push/subscribe { endpoint } → alerts off for this phone
 *
 * For the app installed from the browser (lib/web-push). Always the ACTOR,
 * like /api/push/register: an owner viewing as an agent must not route that
 * agent's alerts to their own pocket.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const key = process.env.VAPID_PUBLIC_KEY ?? "";
  return NextResponse.json(key ? { ok: true, key } : { ok: false, error: "Phone alerts are not set up on this environment yet." });
}

type Body = { endpoint?: string; keys?: { p256dh?: string; auth?: string } };

/* Only the push services the browsers actually use, so a forged subscription
   cannot point our server at anything else. */
const PUSH_HOSTS = [/\.push\.apple\.com$/, /^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/, /^web\.push\.apple\.com$/];

function goodEndpoint(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && PUSH_HOSTS.some((h) => h.test(u.hostname)) && raw.length < 2048;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as Body;
  const endpoint = String(b.endpoint ?? "");
  const p256dh = String(b.keys?.p256dh ?? "");
  const auth = String(b.keys?.auth ?? "");
  if (!goodEndpoint(endpoint) || !/^[A-Za-z0-9_-]{80,100}$/.test(p256dh) || !/^[A-Za-z0-9_-]{16,32}$/.test(auth)) {
    return NextResponse.json({ ok: false, error: "That is not a push subscription." }, { status: 400 });
  }
  await registerWebSubscription(actor.id, { endpoint, p256dh, auth });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as Body;
  await forgetWebSubscription(actor.id, String(b.endpoint ?? ""));
  return NextResponse.json({ ok: true });
}
