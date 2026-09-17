import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { getAppraisal } from "@/lib/appraisal-store";
import { putInOutlook } from "@/lib/outlook-calendar";
import { accessLine, recordTakeOnBooked, takeOnBooking, takeOnTimes } from "@/lib/takeon";
import { assertNotViewingAs, ViewingAsRefused, VIEW_AS_COOKIE } from "@/lib/view-as";

/**
 * The take-on visit on one appraisal (17 Sep 2026).
 *   GET  → the landlord's suggested times, how we get in, and the booking
 *   POST → book it: the agent's Outlook, and the record
 *
 * The confirmation itself goes through /api/confirmations like every other
 * one, so the agent sees it before it leaves.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const { id } = await ctx.params;
  const [times, booking, access] = await Promise.all([takeOnTimes(id), takeOnBooking(id), accessLine(id)]);
  return NextResponse.json({ ok: true, times, booking, access });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertNotViewingAs(req.cookies.get(VIEW_AS_COOKIE)?.value);
  } catch (e) {
    if (e instanceof ViewingAsRefused) return NextResponse.json({ ok: false, said: e.message }, { status: 423 });
    throw e;
  }
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, said: "Sign in first." }, { status: 401 });
  const { id } = await ctx.params;
  const ma = await getAppraisal(id);
  if (!ma) return NextResponse.json({ ok: false, said: "No such appraisal." }, { status: 404 });

  const b = (await req.json().catch(() => ({}))) as { startsAt?: string; minutes?: number };
  if (!b.startsAt || Number.isNaN(new Date(b.startsAt).getTime())) {
    return NextResponse.json({ ok: false, said: "When is the visit?" }, { status: 400 });
  }
  const minutes = Number(b.minutes) > 0 ? Number(b.minutes) : 60;

  /* Their own diary first: an appointment nobody can see is not booked. */
  const outlook = await putInOutlook({
    userId: actor.id,
    key: `takeon|${ma.id}|${new Date(b.startsAt).toISOString()}`,
    subject: `Take-on visit - photographs and floor plan, ${ma.address}`,
    startsAt: b.startsAt,
    minutes,
    location: [ma.address, ma.postcode].filter(Boolean).join(", "),
    body: `Photographs, floor plan and the details for the advert, with ${ma.landlord}.`,
  }).catch((e) => ({ ok: false, detail: e instanceof Error ? e.message : "Outlook refused it." }));

  await recordTakeOnBooked(ma.id, { startsAt: b.startsAt, minutes, by: actor.name || actor.email, at: new Date().toISOString() });
  return NextResponse.json({ ok: true, outlook, said: outlook.ok ? "In your Outlook calendar." : (outlook.detail ?? "Booked.") });
}
