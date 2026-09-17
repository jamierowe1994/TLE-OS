import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { putViewingInRexDiary } from "@/lib/rex-diary-write";
import { putInOutlook } from "@/lib/outlook-calendar";
import { assertNotViewingAs, ViewingAsRefused, VIEW_AS_COOKIE } from "@/lib/view-as";

/**
 * POST → a viewing booked in the OS, carried everywhere it needs to be
 * (15 Sep 2026). In this order, each one independent of the others:
 *
 *   1. the agent's own Outlook calendar (lib/outlook-calendar) - their diary
 *   2. REX's diary, as the silent mirror (lib/rex-diary-write) - REX sends nothing
 *
 * It does NOT email the applicant (17 Sep 2026). The agent is shown the
 * confirmation next, can rewrite it, and sends it through /api/confirmations.
 *
 * Body: { leadId, listingId, contactId, applicantName, applicantEmail, address, startsAt, minutes }.
 * Answers with what happened at each, in words, for the lead's row. Never while
 * viewing as somebody: it would land in the wrong diary under the wrong name.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    assertNotViewingAs(req.cookies.get(VIEW_AS_COOKIE)?.value);
  } catch (e) {
    if (e instanceof ViewingAsRefused) return NextResponse.json({ ok: false, said: e.message }, { status: 423 });
    throw e;
  }
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, said: "Sign in first." }, { status: 401 });

  const b = (await req.json().catch(() => ({}))) as {
    leadId?: string; listingId?: string | number | null; contactId?: string | number | null;
    applicantName?: string; applicantEmail?: string | null; address?: string; startsAt?: string; minutes?: number;
    unaccompanied?: boolean;
  };
  if (!b.leadId || !b.startsAt || Number.isNaN(new Date(b.startsAt).getTime())) {
    return NextResponse.json({ ok: false, said: "Which lead, and when?" }, { status: 400 });
  }
  const applicantName = (b.applicantName ?? "").trim() || "The applicant";
  const address = (b.address ?? "").trim() || "the property";
  const minutes = Number(b.minutes) || 30;
  const listingId = b.listingId != null && b.listingId !== "" ? String(b.listingId) : null;
  const unaccompanied = b.unaccompanied === true;

  const outlook = await putInOutlook({
    userId: actor.id,
    key: `viewing|${b.leadId}|${listingId ?? "-"}|${new Date(b.startsAt).toISOString()}`,
    subject: `${unaccompanied ? "Unaccompanied viewing" : "Viewing"} - ${address} with ${applicantName}`,
    body: `Booked in TLE OS.${unaccompanied ? " Unaccompanied - nobody from us is going." : ""}\nApplicant: ${applicantName}${b.applicantEmail ? ` (${b.applicantEmail})` : ""}`,
    /* An unaccompanied viewing is in the agent's diary so they know it is
       happening, but it does not take their time. */
    showAs: unaccompanied ? "free" : "busy",
    location: address,
    startsAt: b.startsAt,
    minutes,
  }).catch(() => ({ ok: false as const, reason: "refused" as const, detail: "Could not reach Outlook." }));

  const rex = await putViewingInRexDiary({
    userId: actor.id,
    leadId: String(b.leadId),
    listingId,
    contactId: b.contactId != null && b.contactId !== "" ? String(b.contactId) : null,
    applicantName,
    address,
    startsAt: b.startsAt,
    minutes,
    unaccompanied,
  }).catch(() => ({ ok: false as const, reason: "refused" as const, detail: "Could not reach REX." }));

  /* For the agent's row: their diary and the email. The REX mirror is in the
     response for owners, never in the words an agent reads. */
  const said = [outlook.ok ? "In your Outlook calendar." : outlook.detail, "Confirmation not sent yet."].filter(Boolean).join(" ");
  return NextResponse.json({ ok: true, said, outlook, rex });
}
