import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { hasDb, q } from "@/lib/db";
import { uid } from "@/lib/auth";
import { whoIs } from "@/lib/admin";
import { assertNotViewingAs, ViewingAsRefused, VIEW_AS_COOKIE } from "@/lib/view-as";
import { putInOutlook, removeFromOutlook } from "@/lib/outlook-calendar";

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

  let b: { startsAt?: string; mins?: number; kind?: string; title?: string; where?: string; who?: string; notes?: string; outlook?: boolean };
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

  /* Travel may run past the eight hours an appointment gets: the buffer is
     the whole drive, and cutting it short puts the agent somewhere they
     can't be. */
  const most = b.kind === "travel" ? 16 * 60 : 8 * 60;
  const mins = Math.min(Math.max(Number(b.mins) || 30, 15), most);

  try {
    const id = uid();
    const notes = (b.notes ?? "").trim().slice(0, 4000);
    await q(
      `INSERT INTO os_appointments (id, starts_at, mins, kind, title, where_at, who, author_id, author_name, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id, when.toISOString(), mins, (b.kind ?? "other").slice(0, 24), title.slice(0, 200),
       (b.where ?? "").slice(0, 200), (b.who ?? "").slice(0, 120), me?.id ?? null, me?.name ?? "", notes]
    );
    /* A general appointment made with New appointment goes into their own
       Outlook as well (Richard + Rhiannon, 19 Oct 2026), like every other
       booking the OS makes: their Outlook is their diary everywhere else.
       Nobody is invited and nobody is emailed (lib/outlook-calendar). Travel
       buffers from the booker do not ask for this. */
    if (b.outlook && me?.id) {
      const put = await putInOutlook({
        userId: me.id,
        key: `appointment|${id}`,
        subject: title,
        body: notes,
        location: (b.where ?? "").trim(),
        startsAt: when.toISOString(),
        minutes: mins,
      });
      return NextResponse.json({
        ok: true,
        id,
        outlook: put.ok ? { ok: true } : { ok: false, detail: put.detail },
        note: put.ok ? "In your diary and your Outlook calendar." : `In your diary. ${put.detail}`,
      });
    }
    return NextResponse.json({
      ok: true,
      id,
      // Said plainly, every time, so nobody assumes it left the building.
      note: "In your diary here. It has not gone into your Outlook calendar.",
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: publicError(e, "Could not save it.") },
      { status: 502 }
    );
  }
}

/**
 * Cancel a general appointment made here (Rhiannon, 15 Oct 2026: "no option
 * to cancel" a duplicate she had put in her diary).
 *
 * Only the OS's own general entries, and only the person who made them: a
 * booked viewing cancels through its own file (lib/viewing-change), a slot
 * through Remove slot, an inspection visit through the inspection. One made
 * with New appointment also went into their Outlook (19 Oct 2026), so that
 * copy is taken out too; the rest never left the OS.
 */
export async function DELETE(req: NextRequest) {
  try {
    assertNotViewingAs(req.cookies.get(VIEW_AS_COOKIE)?.value);
  } catch (e) {
    if (e instanceof ViewingAsRefused) return NextResponse.json({ ok: false, said: e.message }, { status: 423 });
    throw e;
  }
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, said: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, said: "Nothing to cancel here." }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { id?: string };
  const rowId = String(b.id ?? "").replace(/^os-/, "");
  if (!/^[A-Za-z0-9-]{8,64}$/.test(rowId)) return NextResponse.json({ ok: false, said: "Which appointment?" }, { status: 400 });

  const gone = await q<{ id: string }>(
    `DELETE FROM os_appointments
      WHERE id = $1 AND author_id = $2 AND booking IS NULL AND rex_event_id IS NULL
        AND kind <> 'slot' AND id NOT LIKE 'inspection-%'
      RETURNING id`,
    [rowId, actor.id]
  ).catch(() => null);
  if (gone === null) return NextResponse.json({ ok: false, said: "That didn't cancel it. Try again." }, { status: 502 });
  if (!gone.length) return NextResponse.json({ ok: false, said: "That appointment isn't yours to cancel, or it has gone already." }, { status: 404 });
  /* Only where the OS put it in Outlook (an 'outlook-event' row keyed by it);
     otherwise this says so quietly and nothing is touched. */
  const outlook = await removeFromOutlook(actor.id, `appointment|${rowId}`).catch(() => ({ ok: false, detail: "" }));
  return NextResponse.json({ ok: true, said: outlook.ok ? "Cancelled and taken out of your diary and your Outlook." : "Cancelled and taken out of your diary." });
}
