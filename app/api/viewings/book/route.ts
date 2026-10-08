import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { putViewingInRexDiary } from "@/lib/rex-diary-write";
import { rexCopiesToOutlook } from "@/lib/rex-outlook-sync";
import { putInOutlook } from "@/lib/outlook-calendar";
import { accessLineFor, fullAddressFor, rexContactDetails, viewingBrief } from "@/lib/viewing-brief";
import { isOsLead, osContactIdFrom } from "@/lib/contacts-as-leads";
import { getContact, markRex } from "@/lib/contacts-store";
import { pushContactToRex } from "@/lib/rex-contacts";
import { assertNotViewingAs, ViewingAsRefused, VIEW_AS_COOKIE } from "@/lib/view-as";
import { addTestViewing, isTestId } from "@/lib/test-overlay";
import { hasDb, q } from "@/lib/db";
import { uid } from "@/lib/auth";
import { copyBlockAccess, type BlockAccess } from "@/lib/viewing-block";

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
 * Body: { leadId, listingId, contactId, applicantName, applicantEmail, address, startsAt, minutes, blockOf? }.
 * blockOf (8 Oct 2026) is the viewing this one is added after - "Add another
 * viewing to this slot" - and the new viewing takes its access (lib/viewing-block).
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
    blockOf?: string | null;
  };
  if (!b.leadId || !b.startsAt || Number.isNaN(new Date(b.startsAt).getTime())) {
    return NextResponse.json({ ok: false, said: "Which lead, and when?" }, { status: 400 });
  }
  const applicantName = (b.applicantName ?? "").trim() || "The applicant";
  let address = (b.address ?? "").trim() || "the property";
  const minutes = Number(b.minutes) || 30;
  const listingId = b.listingId != null && b.listingId !== "" ? String(b.listingId) : null;
  const unaccompanied = b.unaccompanied === true;
  const blockOf = typeof b.blockOf === "string" && /^(rex|os)-[A-Za-z0-9-]{1,64}$/.test(b.blockOf) ? b.blockOf : null;
  /* Part of a block: the new viewing shares the first one's access. */
  const joinBlock = async (viewingId: string | null, propertyId: string | null): Promise<BlockAccess | null> =>
    blockOf && viewingId
      ? copyBlockAccess({ listingId, propertyId, fromViewingId: blockOf, toViewingId: viewingId, startsAt: b.startsAt!, by: actor.name || actor.email }).catch(() => "none" as const)
      : null;

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
      leadId: String(b.leadId),
    }).catch(() => null);
    const testViewingId = made ? `os-${made.appointmentId}` : null;
    const blockAccess = await joinBlock(testViewingId, null);
    return NextResponse.json({
      ok: Boolean(made),
      test: true,
      viewingId: testViewingId,
      blockAccess,
      said: made
        ? "Test viewing. It is in your diary and on the test file - nothing went to Outlook, REX or the applicant."
        : "That test listing has gone. Reset the test file and try again.",
      outlook: { ok: false, detail: "Test viewing: nothing was put in Outlook." },
    }, made ? undefined : { status: 404 });
  }

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

  /* What the agent's diary entry says (lib/viewing-brief, 6 Oct 2026): the
     address with its postcode, the applicant's number and email, the access. */
  address = await fullAddressFor(listingId, address);
  let applicantPhone: string | null = null;
  let applicantEmail = (b.applicantEmail ?? "").trim() || null;
  if (contactId) {
    const d = await rexContactDetails(contactId).catch(() => ({ phone: null, email: null }));
    applicantPhone = d.phone;
    applicantEmail = applicantEmail ?? d.email;
  } else if (isOsLead(String(b.leadId))) {
    const c = await getContact(osContactIdFrom(String(b.leadId))).catch(() => null);
    applicantPhone = c?.mobile?.trim() || null;
  }
  const { readListingDetails } = await import("@/lib/listing-details");
  const listingDetails = listingId ? await readListingDetails(Number(listingId), { cached: true }).catch(() => null) : null;
  const access = await accessLineFor(listingId, listingDetails?.propertyId ?? null).catch(() => null);
  const brief = viewingBrief({ address, applicantName, phone: applicantPhone, email: applicantEmail, access, unaccompanied, agentName: actor.name });

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
    description: brief,
  }).catch(() => ({ ok: false as const, reason: "refused" as const, detail: "Could not reach REX." }));

  /* INTO OUTLOOK - unless their REX already copies its diary there (Howard,
     24 Sep 2026: two of every viewing). Then REX's copy is the one, and this
     only stands aside once REX has actually taken the entry; see
     lib/rex-outlook-sync. */
  const viaRex = rex.ok && (await rexCopiesToOutlook(actor.id));
  const outlook = viaRex
    ? { ok: true as const, viaRex: true, detail: "In your Outlook calendar through REX's own copy." }
    : await putInOutlook({
    userId: actor.id,
    key: `viewing|${b.leadId}|${listingId ?? "-"}|${new Date(b.startsAt).toISOString()}`,
    subject: `${unaccompanied ? "Unaccompanied viewing" : "Viewing"} - ${address} with ${applicantName}`,
    body: brief,
    /* An unaccompanied viewing is in the agent's diary so they know it is
       happening, but it does not take their time. */
    showAs: unaccompanied ? "free" : "busy",
    location: address,
    startsAt: b.startsAt,
    minutes,
  }).catch(() => ({ ok: false as const, reason: "refused" as const, detail: "Could not reach Outlook." }));

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
    applicantPhone,
    address,
    startsAt: new Date(b.startsAt).toISOString(),
    minutes,
    unaccompanied,
  };
  /* The id the listing and the diary know this viewing by, so the booker's
     last step can confirm access on it: REX's when REX took it. */
  const rowId = uid();
  let viewingId: string | null = rexEventId ? `rex-${rexEventId}` : null;
  if (hasDb()) {
    const saved = await q(
      `INSERT INTO os_appointments (id, starts_at, mins, kind, title, where_at, who, author_id, author_name, rex_event_id, synced_at, lead_id, contact_email, booking)
       VALUES ($1, $2, $3, 'viewing', $4, $5, $6, $7, $8, $9, CASE WHEN $9::text IS NULL THEN NULL ELSE NOW() END, $10, $11, $12::jsonb)`,
      [rowId, booking.startsAt, minutes, `${unaccompanied ? "Unaccompanied viewing" : "Viewing"} - ${address} with ${applicantName}`.slice(0, 200),
       address.slice(0, 200), applicantName.slice(0, 120), actor.id, actor.name ?? "", rexEventId, booking.leadId, booking.applicantEmail, JSON.stringify(booking)]
    ).then(() => true).catch(() => false);
    if (saved && !viewingId) viewingId = `os-${rowId}`;
  }

  /* For the agent's row: their diary and the email. The REX mirror is in the
     response for owners, never in the words an agent reads. */
  const said = [outlook.ok ? "In your Outlook calendar." : outlook.detail, "Confirmation not sent yet."].filter(Boolean).join(" ");
  const blockAccess = await joinBlock(viewingId, listingDetails?.propertyId ?? null);
  return NextResponse.json({ ok: true, said, outlook, rex, tenant, viewingId, blockAccess });
}
