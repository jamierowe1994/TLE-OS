import { NextRequest, NextResponse } from "next/server";
import { currentLandlord, landlordJourneys } from "@/lib/landlord-account";
import { hasDb, q } from "@/lib/db";

/**
 * POST { token } - this landlord has read past the first spread of their
 * presentation, in their own file (James, 17 Sep 2026). Moves their next
 * step from View your presentation to Sign your contract. Only a deck that
 * is on one of their own appraisals can be marked.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const me = await currentLandlord();
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const { token, view } = (await req.json().catch(() => ({}))) as { token?: string; view?: boolean };
  if (!token) return NextResponse.json({ ok: false, error: "Which presentation?" }, { status: 400 });
  const journeys = await landlordJourneys(me);
  if (!journeys.some((j) => j.decks.some((d) => d.token === token))) {
    return NextResponse.json({ ok: false, error: "Not one of yours." }, { status: 404 });
  }
  /* view: an open of the booklet, counted for the agent's eye icon. */
  if (hasDb() && view) {
    await q(
      `INSERT INTO os_case_state (kind, record_id, payload, updated_at, updated_by)
       VALUES ('landlord-deck-views', $1, $2::jsonb, NOW(), $3)
       ON CONFLICT (kind, record_id) DO UPDATE
         SET payload = jsonb_build_object('count', COALESCE((os_case_state.payload->>'count')::int, 0) + 1, 'lastAt', $4::text),
             updated_at = NOW()`,
      [token, JSON.stringify({ count: 1, lastAt: new Date().toISOString() }), me.email, new Date().toISOString()]
    );
    return NextResponse.json({ ok: true });
  }
  if (hasDb()) {
    await q(
      `INSERT INTO os_case_state (kind, record_id, payload, updated_at, updated_by)
       VALUES ('landlord-deck-read', $1, $2::jsonb, NOW(), $3)
       ON CONFLICT (kind, record_id) DO NOTHING`,
      [`${me.id}|${token}`, JSON.stringify({ readAt: new Date().toISOString() }), me.email]
    );
  }
  return NextResponse.json({ ok: true });
}
