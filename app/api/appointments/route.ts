import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { hasDb, q } from "@/lib/db";
import { uid } from "@/lib/auth";

/**
 * Appointments and reminders made in the OS.
 *
 * ⚠️ THESE DO NOT REACH REX. The OS is locked read-only against the team's
 * live system, so anything booked here is held in our own database and
 * marked unsynced. That is a deliberate half-measure: the work isn't lost,
 * the screen is honest that it hasn't left the building, and the day writes
 * are switched on there is a queue to send.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Row extends Record<string, unknown> {
  id: string; starts_at: Date; mins: number; kind: string;
  title: string; where_at: string; who: string; author_name: string; synced_at: Date | null;
}

export async function GET() {
  if (!hasDb()) return NextResponse.json({ ok: true, appointments: [] });
  try {
    const rows = await q<Row>(
      `SELECT id, starts_at, mins, kind, title, where_at, who, author_name, synced_at
       FROM os_appointments WHERE starts_at > NOW() - INTERVAL '30 days' ORDER BY starts_at`
    );
    return NextResponse.json({
      ok: true,
      appointments: rows.map((r) => ({
        id: r.id,
        startsAt: new Date(r.starts_at).toISOString(),
        mins: r.mins,
        kind: r.kind,
        title: r.title,
        where: r.where_at,
        who: r.who,
        author: r.author_name,
        synced: Boolean(r.synced_at),
      })),
    });
  } catch {
    return NextResponse.json({ ok: true, appointments: [] });
  }
}

export async function POST(req: NextRequest) {
  if (!hasDb()) {
    return NextResponse.json(
      { ok: false, error: "No database on this environment — nowhere to keep it." },
      { status: 503 }
    );
  }
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  const me = userId ? await findUserById(userId) : null;

  let b: { startsAt?: string; mins?: number; kind?: string; title?: string; where?: string; who?: string };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected an appointment." }, { status: 400 });
  }

  const title = (b.title ?? "").trim();
  const when = b.startsAt ? new Date(b.startsAt) : null;
  if (!title) return NextResponse.json({ ok: false, error: "It needs a name." }, { status: 400 });
  if (!when || Number.isNaN(when.getTime())) {
    return NextResponse.json({ ok: false, error: "That date didn't make sense." }, { status: 400 });
  }

  const mins = Math.min(Math.max(Number(b.mins) || 30, 15), 8 * 60);

  try {
    const id = uid();
    await q(
      `INSERT INTO os_appointments (id, starts_at, mins, kind, title, where_at, who, author_id, author_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, when.toISOString(), mins, (b.kind ?? "other").slice(0, 24), title.slice(0, 200),
       (b.where ?? "").slice(0, 200), (b.who ?? "").slice(0, 120), me?.id ?? null, me?.name ?? ""]
    );
    return NextResponse.json({
      ok: true,
      id,
      // Said plainly, every time, so nobody assumes it left the building.
      note: "Saved in the OS. It has NOT been added to REX or your 365 diary — those writes are switched off.",
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Could not save it." },
      { status: 502 }
    );
  }
}
