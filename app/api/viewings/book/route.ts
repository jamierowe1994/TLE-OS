import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { putViewingInRexDiary } from "@/lib/rex-diary-write";
import { putInOutlook } from "@/lib/outlook-calendar";
import { isOsLead, osContactIdFrom } from "@/lib/contacts-as-leads";
import { getContact, markRex } from "@/lib/contacts-store";
import { pushContactToRex } from "@/lib/rex-contacts";
import { assertNotViewingAs, ViewingAsRefused, VIEW_AS_COOKIE } from "@/lib/view-as";
import { addTestViewing, isTestId } from "@/lib/test-overlay";
import { hasDb, q } from "@/lib/db";
import { uid } from "@/lib/auth";

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

  /* A TEST LISTING (negative id, lib/test-overlay): the viewing goes in the
     tester's own diary and onto the test file, and stops there. Nothing
     reaches Outlook, REX or the applicant, and it shows on the listing, the
     landlord's portal and the tenant's like a real one. */
  if (isTestId(listingId)) {
    const made = await addTestViewing({
      listingId: Number(listingId),
      startsAt: b.startsAt,
      mins: minutes,
      who: applicantName,
      tenantEmail: (b.applicantEmail ?? "").trim().toLowerCase(),
      withName: (actor.name || "").split(/\s+/)[0] || actor.name || "",
      authorId: actor.id,
      authorName: actor.name ?? "",
    }).catch(() => null);
    return NextResponse.json({
      ok: Boolean(made),
      test: true,
      said: made
        ? "Test viewing. It is in your diary and on the test file - nothing went to Outlook, REX or the applicant."
        : "That test listing has gone. Reset the test file and try again.",
      outlook: { ok: false, detail: "Test viewing: nothing was put in Outlook." },
    }, made ? undefined : { status: 404 });
  }

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

  /* The applicant goes into REX with the viewing (James, 18 Sep 2026: "if a
     tenant goes for a viewing, it should then push that"). An OS lead with no
     REX contact yet is pushed now, so the diary entry is joined to them.
     Test contacts refuse inside pushContactToRex and stay in the OS. */
  let contactId = b.contactId != null && b.contactId !== "" ? String(b.contactId) : null;
  let tenant: { pushed: boolean; detail: string } | null = null;
  if (!contactId && isOsLead(String(b.leadId))) {
    const c = await getContact(osContactIdFrom(String(b.leadId))).catch(() => null);
    if (c?.rexId) contactId = c.rexId;
    else if (c && !c.isTest) {
      const pushed = await pushContactToRex(c, actor.id).catch((e) => ({ ok: false as const, reason: "refused" as const, detail: e instanceof Error ? e.message : "REX push failed." }));
      if (pushed.ok) {
        contactId = pushed.rexId;
        await markRex(c.id, "sent", pushed.detail, pushed.rexId, actor.name || actor.email).catch(() => null);
      } else {
        /* "failed" only when REX said no; our own locks leave it held, as /api/contacts does. */
        const state = pushed.reason === "refused" || pushed.reason === "rex_session_expired" ? "failed" : "held";
        await markRex(c.id, state, pushed.detail, null, actor.name || actor.email).catch(() => null);
      }
      tenant = { pushed: pushed.ok, detail: pushed.detail };
    }
  }

  const rex = await putViewingInRexDiary({
    userId: actor.id,
    leadId: String(b.leadId),
    listingId,
    contactId,
    applicantName,
    address,
    startsAt: b.startsAt,
    minutes,
    unaccompanied,
  }).catch(() => ({ ok: false as const, reason: "refused" as const, detail: "Could not reach REX." }));

  /* THE OS'S OWN RECORD (22 Sep 2026). The booking used to live only in
     Outlook and REX: an agent whose REX copy failed - every unlinked agent in
     the pilot - had the viewing in neither diary the OS draws, and the Send
     confirmation button went with the drawer that made it. The row carries
     what the confirmation needs, so it can be sent from the record later.
     When REX did take it, the REX id is written on so nothing shows twice. */
  const rexEventId = rex.ok && "eventId" in rex && rex.eventId != null ? String(rex.eventId) : null;
  const booking = {
    leadId: String(b.leadId),
    listingId,
    applicantName,
    applicantEmail: (b.applicantEmail ?? "").trim().toLowerCase() || null,
    address,
    startsAt: new Date(b.startsAt).toISOString(),
    minutes,
    unaccompanied,
  };
  if (hasDb()) {
    await q(
      `INSERT INTO os_appointments (id, starts_at, mins, kind, title, where_at, who, author_id, author_name, rex_event_id, synced_at, lead_id, contact_email, booking)
       VALUES ($1, $2, $3, 'viewing', $4, $5, $6, $7, $8, $9, CASE WHEN $9::text IS NULL THEN NULL ELSE NOW() END, $10, $11, $12::jsonb)`,
      [uid(), booking.startsAt, minutes, `${unaccompanied ? "Unaccompanied viewing" : "Viewing"} - ${address} with ${applicantName}`.slice(0, 200),
       address.slice(0, 200), applicantName.slice(0, 120), actor.id, actor.name ?? "", rexEventId, booking.leadId, booking.applicantEmail, JSON.stringify(booking)]
    ).catch(() => null);
  }

  /* For the agent's row: their diary and the email. The REX mirror is in the
     response for owners, never in the words an agent reads. */
  const said = [outlook.ok ? "In your Outlook calendar." : outlook.detail, "Confirmation not sent yet."].filter(Boolean).join(" ");
  return NextResponse.json({ ok: true, said, outlook, rex, tenant });
}
