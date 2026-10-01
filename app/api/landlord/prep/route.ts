import { NextRequest, NextResponse } from "next/server";
import { currentLandlord } from "@/lib/landlord-account";
import { tickPrep } from "@/lib/landlord-prep";

/**
 * POST /api/landlord/prep  { id, done }
 *
 * The landlord ticks off a job on their Before moving day list. Only their
 * own rows: the account comes from the session, never the body.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const me = await currentLandlord();
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { id?: string; done?: boolean };
  const id = String(b.id ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "Which job?" }, { status: 400 });
  const ok = await tickPrep(me.id, id, b.done === true).catch(() => false);
  if (!ok) return NextResponse.json({ ok: false, error: "That job isn't on your list." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
