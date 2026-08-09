import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { hasDb, q } from "@/lib/db";

/**
 * What belongs to one person: their dashboard layout, their profile, their
 * accent, which columns they keep.
 *
 * All of it lived in the browser until now, which meant a cleared cache was
 * a wiped desk and a second machine was a stranger. It lives in os_user_prefs
 * now, keyed by the account that owns it.
 *
 * SIGNED OUT IS NOT AN ERROR. The OS still runs behind the shared access code
 * while the team gets accounts, so an unauthenticated request gets an empty
 * set and the browser copy carries on. Nothing breaks; it just doesn't follow
 * you anywhere.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** A stored preference should be a setting, not a filing cabinet. */
const MAX_VALUE_BYTES = 64 * 1024;

function userIdFrom(req: NextRequest): string | null {
  return verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
}

export async function GET(req: NextRequest) {
  const userId = userIdFrom(req);
  if (!userId || !hasDb()) {
    return NextResponse.json({ ok: true, signedIn: false, prefs: {} });
  }
  try {
    const rows = await q<{ key: string; value: unknown }>(
      "SELECT key, value FROM os_user_prefs WHERE user_id = $1",
      [userId]
    );
    const prefs: Record<string, unknown> = {};
    for (const r of rows) prefs[r.key] = r.value;
    return NextResponse.json({ ok: true, signedIn: true, prefs });
  } catch {
    // A prefs table that won't answer is a browser-only session, not an
    // error worth showing anybody.
    return NextResponse.json({ ok: true, signedIn: false, prefs: {} });
  }
}

export async function PUT(req: NextRequest) {
  const userId = userIdFrom(req);
  if (!userId || !hasDb()) {
    return NextResponse.json({ ok: true, saved: false, reason: "not signed in" });
  }

  let body: { key?: string; value?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected a key and a value." }, { status: 400 });
  }

  const key = (body.key ?? "").trim();
  if (!key || key.length > 80) {
    return NextResponse.json({ ok: false, error: "Bad preference key." }, { status: 400 });
  }
  const encoded = JSON.stringify(body.value ?? null);
  if (encoded.length > MAX_VALUE_BYTES) {
    return NextResponse.json(
      { ok: false, error: "That setting is too big to store." },
      { status: 413 }
    );
  }

  try {
    await q(
      `INSERT INTO os_user_prefs (user_id, key, value, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [userId, key, encoded]
    );
    return NextResponse.json({ ok: true, saved: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Could not save." },
      { status: 502 }
    );
  }
}
