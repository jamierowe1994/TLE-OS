import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { inspectionByToken, kindLabel, moveInspection, logEvent, type AccessReply } from "@/lib/inspections";

/**
 * The tenant's answer about access, from the link in their email.
 *
 * No sign-in and no session: the token IS the permission, the same way the
 * contractor's page works. What comes back is written on the inspection with
 * a timestamp and their own words, and that row is what the agency relies on
 * later to show the tenant agreed.
 *
 * GET  → what they are being asked, and the dates on offer.
 * POST → yes with a chosen date, no, or none of these times.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const i = await inspectionByToken(token);
  if (!i) return NextResponse.json({ ok: false, error: "That link isn't one of ours." }, { status: 404 });
  return NextResponse.json({
    ok: true,
    visit: {
      kind: kindLabel(i.kind),
      address: [i.propertyName, i.locality].filter(Boolean).join(", "),
      tenant: i.tenant,
      offered: i.offered,
      noticeHours: i.noticeHours,
      reply: i.accessReply,
      bookedAt: i.bookedAt,
      askedAt: i.accessAskedAt,
    },
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const i = await inspectionByToken(token);
  if (!i || !hasDb()) return NextResponse.json({ ok: false, error: "That link isn't one of ours." }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as { reply?: string; at?: string; note?: string };
  const reply = b.reply as AccessReply;
  if (reply !== "yes" && reply !== "no" && reply !== "other_time") {
    return NextResponse.json({ ok: false, error: "Tell us yes, another time, or no." }, { status: 400 });
  }
  /* A yes has to be a yes to one of the times we offered. Anything else is
     "another time", so nobody can be recorded as agreeing to a date that was
     never put to them. */
  const at = reply === "yes" && b.at && i.offered.includes(b.at) ? b.at : null;
  if (reply === "yes" && !at) return NextResponse.json({ ok: false, error: "Pick one of the times offered." }, { status: 400 });
  const who = i.tenant.trim() || "The tenant";
  const next = await moveInspection(i.id, { action: "access_reply", reply, at, note: (b.note ?? "").trim(), by: who }, who);
  /* Their yes books it: the date was theirs to choose and re-typing it on
     our side is how a diary and a promise drift apart. */
  if (reply === "yes" && at) {
    await moveInspection(i.id, { action: "book", at, inspector: next.inspector }, who);
    await logEvent(i.id, who, "access", "Booked from the tenant's own choice of time.");
  }
  return NextResponse.json({ ok: true, reply, at });
}
