import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb, q } from "@/lib/db";
import { uid } from "@/lib/auth";
import { putInOutlook, removeFromOutlook } from "@/lib/outlook-calendar";
import { fullAddressFor } from "@/lib/viewing-brief";
import { isTestId } from "@/lib/test-overlay";
import { assertNotViewingAs, ViewingAsRefused, VIEW_AS_COOKIE } from "@/lib/view-as";

/**
 * A VIEWING SLOT (James, 8 Oct 2026).
 *
 * "Rather than it saying book viewing, it would be book slot ... It might be
 * 15 minutes, half an hour, an hour, 2 hours ... within that slot, we would
 * then block that out. We would have the ability to book tenants in within
 * that slot." Ruskin Road: an hour tomorrow, 12 till 1, several tenants.
 *
 *   POST   { listingId, address, startsAt, minutes }  -> the slot, held
 *   DELETE { slotId }                                 -> the slot, let go
 *
 * A slot is the OS's own diary entry (os_appointments kind "slot") and goes
 * into the agent's Outlook as busy, so the time is theirs. It names nobody,
 * so it goes nowhere else: not REX, and nobody is emailed. Tenants are then
 * booked within it one at a time (components/viewings/AddToBlock), each an
 * ordinary viewing. A test listing's slot stays in the OS.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const outlookKey = (rowId: string) => `slot|${rowId}`;

export async function POST(req: NextRequest) {
  try {
    assertNotViewingAs(req.cookies.get(VIEW_AS_COOKIE)?.value);
  } catch (e) {
    if (e instanceof ViewingAsRefused) return NextResponse.json({ ok: false, said: e.message }, { status: 423 });
    throw e;
  }
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, said: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, said: "Slots can't be saved on this environment." }, { status: 503 });

  const b = (await req.json().catch(() => ({}))) as { listingId?: string | number | null; address?: string; startsAt?: string; minutes?: number };
  const listingId = b.listingId != null && /^-?\d{1,12}$/.test(String(b.listingId)) ? String(b.listingId) : null;
  const start = new Date(String(b.startsAt ?? ""));
  const minutes = Math.round(Number(b.minutes));
  if (!listingId) return NextResponse.json({ ok: false, said: "Which home is the slot at?" }, { status: 400 });
  if (Number.isNaN(start.getTime())) return NextResponse.json({ ok: false, said: "Pick when the slot starts." }, { status: 400 });
  if (start.getTime() < Date.now() - 5 * 60_000) return NextResponse.json({ ok: false, said: "That time has already gone. Pick a later one." }, { status: 400 });
  if (!Number.isFinite(minutes) || minutes < 5 || minutes > 8 * 60) return NextResponse.json({ ok: false, said: "A slot runs from 5 minutes to 8 hours." }, { status: 400 });

  const test = isTestId(listingId);
  const address = test ? (b.address ?? "").trim() || "the property" : await fullAddressFor(listingId, (b.address ?? "").trim() || "the property");
  const rowId = uid();
  const startsAt = start.toISOString();
  const title = `Viewing slot - ${address}`.slice(0, 200);
  const booking = { listingId, address, startsAt, minutes, slot: true };
  await q(
    `INSERT INTO os_appointments (id, starts_at, mins, kind, title, where_at, who, author_id, author_name, booking)
     VALUES ($1, $2, $3, 'slot', $4, $5, '', $6, $7, $8::jsonb)`,
    [rowId, startsAt, minutes, title, address.slice(0, 200), actor.id, actor.name ?? "", JSON.stringify(booking)]
  );

  const outlook = test
    ? { ok: false as const, detail: "Test listing: nothing was put in Outlook." }
    : await putInOutlook({
        userId: actor.id,
        key: outlookKey(rowId),
        subject: title,
        body: `Held for viewings at ${address}. Tenants are booked within it in the OS, each as their own viewing.`,
        location: address,
        startsAt,
        minutes,
        showAs: "busy",
      }).catch(() => ({ ok: false as const, detail: "Could not reach Outlook." }));

  return NextResponse.json({
    ok: true,
    slotId: `os-${rowId}`,
    said: outlook.ok ? "In your Outlook calendar. Nobody has been told - it is your time." : `${outlook.detail} It is in the OS diary.`,
  });
}

export async function DELETE(req: NextRequest) {
  try {
    assertNotViewingAs(req.cookies.get(VIEW_AS_COOKIE)?.value);
  } catch (e) {
    if (e instanceof ViewingAsRefused) return NextResponse.json({ ok: false, said: e.message }, { status: 423 });
    throw e;
  }
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, said: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, said: "Nothing to remove here." }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { slotId?: string };
  const rowId = String(b.slotId ?? "").replace(/^os-/, "");
  if (!/^[A-Za-z0-9-]{8,64}$/.test(rowId)) return NextResponse.json({ ok: false, said: "Which slot?" }, { status: 400 });

  /* Only the person whose time it is lets it go. The viewings booked within
     it stay booked: they are their own appointments. */
  const gone = await q<{ id: string }>(`DELETE FROM os_appointments WHERE id = $1 AND kind = 'slot' AND author_id = $2 RETURNING id`, [rowId, actor.id]);
  if (!gone.length) return NextResponse.json({ ok: false, said: "That slot isn't yours, or it has gone already." }, { status: 404 });
  const out = await removeFromOutlook(actor.id, outlookKey(rowId)).catch(() => ({ ok: false, detail: "" }));
  return NextResponse.json({ ok: true, said: out.ok ? "Slot removed, and taken out of your Outlook." : "Slot removed." });
}
