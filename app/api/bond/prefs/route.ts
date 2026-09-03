import { NextRequest, NextResponse } from "next/server";
import { hasDb, q } from "@/lib/db";
import { whoIs } from "@/lib/admin";
import { watchedDistricts } from "@/lib/radar";

/**
 * The person's patch.
 *
 * GET  → { districts: [...] } for the signed-in person (empty when none
 *        chosen), plus every district Bond watches, grouped, so the chooser
 *        can draw itself.
 * POST → { districts: [...] } saves the choice. Only districts Bond watches
 *        are kept; anything else is dropped rather than stored.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!hasDb()) return NextResponse.json({ ok: false, reason: "no database" }, { status: 503 });
  const who = await whoIs(req);
  const all = (await watchedDistricts()).map((d) => d.district);
  let districts: string[] = [];
  if (who.subject) {
    const rows = await q<{ districts: string[] }>(`SELECT districts FROM os_bond_prefs WHERE user_id = $1`, [who.subject.id]);
    districts = Array.isArray(rows[0]?.districts) ? rows[0].districts : [];
  }
  return NextResponse.json({ ok: true, signedIn: Boolean(who.subject), districts, all });
}

export async function POST(req: NextRequest) {
  if (!hasDb()) return NextResponse.json({ ok: false, error: "no database" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { districts?: unknown };
  const all = new Set((await watchedDistricts()).map((d) => d.district));
  const chosen = Array.isArray(body.districts)
    ? [...new Set(body.districts.map((d) => String(d).toUpperCase().trim()).filter((d) => all.has(d)))]
    : [];
  const who = await whoIs(req);
  if (who.subject) {
    await q(
      `INSERT INTO os_bond_prefs (user_id, districts, updated_at) VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (user_id) DO UPDATE SET districts = EXCLUDED.districts, updated_at = NOW()`,
      [who.subject.id, JSON.stringify(chosen)]
    );
  }
  return NextResponse.json({ ok: true, signedIn: Boolean(who.subject), districts: chosen });
}
