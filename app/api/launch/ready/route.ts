import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { hasDb, q } from "@/lib/db";
import { READY_PREF, TOUR_URL, readinessFor } from "@/lib/launch";

/**
 * The pre-start checklist, from the person's own side (James, 12 Oct 2026):
 * photo, REX, email, the tour. The dashboard card reads this; Admin > Launch
 * reads the same answers for everybody (lib/launch readinessFor).
 *
 * POST { tour: true } when they open the tour from the card - the only tick
 * that is a press rather than a connection - and { dismiss: true } to put
 * the card away.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!userId || !hasDb()) return NextResponse.json({ ok: false }, { headers: { "cache-control": "no-store" } });
  try {
    const [rows, ready, mine] = await Promise.all([
      q<{ has_photo: boolean }>(
        `select (photo is not null and photo <> '') as has_photo from os_users where id = $1`, [userId]
      ),
      readinessFor([userId]),
      q<{ value: { dismissedAt?: string } }>(
        `select value from os_user_prefs where user_id = $1 and key = $2`, [userId, READY_PREF]
      ),
    ]);
    const r = ready.get(userId);
    return NextResponse.json({
      ok: true,
      photo: Boolean(rows[0]?.has_photo),
      rex: r?.rex ?? "none",
      email: r?.email ?? false,
      tour: r?.tour ?? false,
      dismissed: typeof mine[0]?.value?.dismissedAt === "string",
      tourUrl: TOUR_URL,
    }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false }, { headers: { "cache-control": "no-store" } });
  }
}

export async function POST(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!userId || !hasDb()) return NextResponse.json({ ok: false }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { tour?: boolean; dismiss?: boolean };
  const patch: Record<string, string> = {};
  if (body.tour) patch.tourAt = new Date().toISOString();
  if (body.dismiss) patch.dismissedAt = new Date().toISOString();
  if (!Object.keys(patch).length) return NextResponse.json({ ok: true });
  await q(
    `insert into os_user_prefs (user_id, key, value, updated_at) values ($1, $2, $3, now())
     on conflict (user_id, key) do update set value = os_user_prefs.value || $3, updated_at = now()`,
    [userId, READY_PREF, JSON.stringify(patch)]
  );
  return NextResponse.json({ ok: true });
}
