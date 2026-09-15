import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { putViewingInRexDiary } from "@/lib/rex-diary-write";
import { assertNotViewingAs, ViewingAsRefused, VIEW_AS_COOKIE } from "@/lib/view-as";

/**
 * POST → a viewing booked in the OS, into the agent's REX diary with REX's
 * confirmations (lib/rex-diary-write, 15 Sep 2026).
 *
 * Body: { leadId, listingId, contactId, applicantName, address, startsAt, minutes }.
 * Never while viewing as somebody: the event would land in the wrong diary and
 * the confirmation would go out in the wrong name.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    assertNotViewingAs(req.cookies.get(VIEW_AS_COOKIE)?.value);
  } catch (e) {
    if (e instanceof ViewingAsRefused) return NextResponse.json({ ok: false, reason: "viewing_as", detail: e.message }, { status: 423 });
    throw e;
  }
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, reason: "signed_out", detail: "Sign in first." }, { status: 401 });

  const b = (await req.json().catch(() => ({}))) as {
    leadId?: string; listingId?: string | number | null; contactId?: string | number | null;
    applicantName?: string; address?: string; startsAt?: string; minutes?: number;
  };
  if (!b.leadId || !b.startsAt || Number.isNaN(new Date(b.startsAt).getTime())) {
    return NextResponse.json({ ok: false, reason: "bad_request", detail: "Which lead, and when?" }, { status: 400 });
  }
  try {
    const out = await putViewingInRexDiary({
      userId: actor.id,
      leadId: String(b.leadId),
      listingId: b.listingId != null && b.listingId !== "" ? String(b.listingId) : null,
      contactId: b.contactId != null && b.contactId !== "" ? String(b.contactId) : null,
      applicantName: (b.applicantName ?? "").trim() || "The applicant",
      address: (b.address ?? "").trim(),
      startsAt: b.startsAt,
      minutes: Number(b.minutes) || 30,
    });
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ ok: false, reason: "refused", detail: e instanceof Error ? e.message : "Couldn't reach REX." });
  }
}
