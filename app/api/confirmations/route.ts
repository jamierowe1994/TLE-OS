import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb, q } from "@/lib/db";
import { appraisalIdForLead, getAppraisal } from "@/lib/appraisal-store";
import type { MarketAppraisal } from "@/lib/market-appraisal";
import { draftBookingConfirmation, sendBookingConfirmation } from "@/lib/appraisal-confirm";
import { draftLandlordViewing, draftViewingConfirmation, sendLandlordViewing, sendViewingConfirmation, viewingKey, type ViewingBooking } from "@/lib/viewing-confirm";
import { publicOrigin } from "@/lib/origin";
import { draftTakeOnConfirmation, sendTakeOnConfirmation } from "@/lib/takeon";
import { assertNotViewingAs, ViewingAsRefused, VIEW_AS_COOKIE } from "@/lib/view-as";
import { getUpdate, settleRecipient } from "@/lib/customer-updates";
import { renderTleEmail } from "@/lib/email/tle-emails";
import { sendAsAgent } from "@/lib/send-as-agent";
import { logSystemEvent } from "@/lib/business/deal-store";

/**
 * POST → a booking confirmation, seen before it goes (17 Sep 2026).
 *
 *   { action: "draft", kind: "appraisal", id }             the email as it would go
 *   { action: "draft", kind: "viewing", booking }
 *   { action: "send", ...the same, subject, html, again }   the agent's edit, sent
 *
 * Booking no longer sends either of these (lib/confirmations). A send of the
 * same appointment at the same time answers alreadySent unless `again`.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  action?: "draft" | "send";
  kind?: "appraisal" | "viewing" | "viewing-landlord" | "takeon" | "update";
  /** A customer update: which person on it (lib/customer-updates). */
  index?: number;
  id?: string;
  /** Take-on: the time being booked, which is not on the appraisal record. */
  startsAt?: string;
  booking?: {
    leadId?: string; listingId?: string | number | null; applicantName?: string; applicantEmail?: string | null;
    address?: string; startsAt?: string; minutes?: number; unaccompanied?: boolean;
    /** Change time: when it was before, so the email says it has moved. */
    movedFrom?: string | null;
  };
  /** An appraisal being booked, before it is saved: the booker's email column. */
  appraisal?: { leadId?: string; landlord?: string; email?: string | null; address?: string; startsAt?: string; minutes?: number };
  minutes?: number;
  subject?: string;
  html?: string;
  again?: boolean;
};

function bookingFrom(b: Body["booking"]): ViewingBooking | null {
  if (!b?.leadId || !b.startsAt || Number.isNaN(new Date(b.startsAt).getTime())) return null;
  return {
    leadId: String(b.leadId),
    listingId: b.listingId != null && b.listingId !== "" ? String(b.listingId) : null,
    applicant: { name: (b.applicantName ?? "").trim() || "The applicant", email: b.applicantEmail ?? null },
    address: (b.address ?? "").trim() || "the property",
    startsAt: b.startsAt,
    minutes: Number(b.minutes) || 30,
    unaccompanied: b.unaccompanied === true,
    movedFrom: b.movedFrom && !Number.isNaN(new Date(b.movedFrom).getTime()) ? b.movedFrom : null,
  };
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Body;
  if (body.action === "send") {
    try {
      assertNotViewingAs(req.cookies.get(VIEW_AS_COOKIE)?.value);
    } catch (e) {
      if (e instanceof ViewingAsRefused) return NextResponse.json({ ok: false, error: e.message }, { status: 423 });
      throw e;
    }
  }
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const origin = publicOrigin(req);

  try {
    if (body.kind === "appraisal" && body.action !== "send" && body.appraisal) {
      const a = body.appraisal;
      if (!a.leadId || !a.startsAt || Number.isNaN(new Date(a.startsAt).getTime())) {
        return NextResponse.json({ ok: false, error: "Which appraisal, and when?" }, { status: 400 });
      }
      const pending = {
        id: appraisalIdForLead(a.leadId),
        leadId: a.leadId,
        landlord: (a.landlord ?? "").trim() || "there",
        address: (a.address ?? "").trim() || "your property",
        postcode: "",
        appointmentAt: a.startsAt,
        landlordEmail: (a.email ?? "").trim() || null,
      } as unknown as MarketAppraisal;
      return NextResponse.json(await draftBookingConfirmation({ ma: pending, me: actor, minutes: Number(a.minutes) || undefined, unsaved: true, origin }));
    }

    if (body.kind === "appraisal") {
      const ma = body.id ? await getAppraisal(body.id).catch(() => null) : null;
      if (!ma) return NextResponse.json({ ok: false, error: "That appraisal isn't here any more." }, { status: 404 });
      if (body.action === "send") {
        const r = await sendBookingConfirmation({ ma, me: actor, subject: body.subject, html: body.html, again: body.again === true, minutes: Number(body.minutes) || undefined, origin });
        return NextResponse.json({ ok: r.sent, sent: r.sent, alreadySent: r.alreadySent ?? false, detail: r.sent ? `Sent to ${r.to}.` : r.reason });
      }
      return NextResponse.json(await draftBookingConfirmation({ ma, me: actor, origin }));
    }

    /* THE TAKE-ON VISIT - photographs and the floor plan. Drafted beside the
       diary in the booker and sent with the booking (James, 17 Sep 2026). */
    if (body.kind === "takeon") {
      const ma = body.id ? await getAppraisal(body.id) : null;
      if (!ma) return NextResponse.json({ ok: false, error: "No such appraisal." }, { status: 404 });
      const startsAt = (body.startsAt ?? "").trim();
      if (!startsAt || Number.isNaN(new Date(startsAt).getTime())) {
        return NextResponse.json({ ok: false, error: "When is the visit?" }, { status: 400 });
      }
      const minutes = Number(body.minutes) > 0 ? Number(body.minutes) : 60;
      if (body.action === "send") {
        const out = await sendTakeOnConfirmation({ ma, me: actor, startsAt, minutes, subject: body.subject, html: body.html, again: body.again, origin });
        return NextResponse.json(out.sent ? { sent: true, detail: out.detail } : { sent: false, detail: out.reason });
      }
      return NextResponse.json(await draftTakeOnConfirmation({ ma, me: actor, startsAt, minutes, origin }));
    }

    /* A CUSTOMER UPDATE (2 Oct 2026): the words the OS wrote for one person
       on the let, read and changed by the agent, sent from their own address.
       Sending settles that person on the update. */
    if (body.kind === "update") {
      const u = body.id ? await getUpdate(Number(body.id)) : null;
      const who = u?.recipients[Number(body.index)];
      if (!u || !who) return NextResponse.json({ ok: false, error: "That update isn't here any more." }, { status: 404 });
      if (body.action === "send") {
        if (!who.email) return NextResponse.json({ sent: false, detail: `There's no email address for ${who.name}. Ring them instead.` });
        const subject = (body.subject ?? "").trim();
        const html = body.html ?? "";
        if (!subject || !html) return NextResponse.json({ sent: false, detail: "The email is empty." });
        const r = await sendAsAgent({ me: actor, to: who.email, toName: who.name, subject, html });
        if (r.sent) {
          await settleRecipient(u.id, Number(body.index), { state: "emailed", by: actor.name || actor.email, note: subject });
          if (u.dealId) {
            await logSystemEvent(u.dealId, { id: actor.id, name: actor.name || actor.email, role: "agent" }, `Emailed ${who.name} (${who.role}): "${subject}"`).catch(() => null);
          }
        }
        return NextResponse.json({ ok: r.sent, sent: r.sent, detail: r.detail });
      }
      const { subject, html } = renderTleEmail(who.emailId, who.vars);
      return NextResponse.json({
        ok: true,
        to: who.email,
        toName: `${who.name} (${who.role})`,
        subject,
        html,
        attachment: null,
        ...(who.email ? {} : { blocked: `There's no email address for ${who.name} on file. Ring them instead, or add their email and come back.` }),
        ...(who.state === "emailed" && who.doneAt ? { alreadySent: { at: who.doneAt, to: who.email ?? "", subject: who.note ?? subject } } : {}),
      });
    }

    /* The landlord, told about a viewing only when the agent says so: the
       booker's Landlord step (6 Oct 2026). */
    if (body.kind === "viewing-landlord") {
      const booking = bookingFrom(body.booking);
      if (!booking) return NextResponse.json({ ok: false, error: "Which viewing, and when?" }, { status: 400 });
      if (body.action === "send") {
        const r = await sendLandlordViewing({ me: actor, booking, subject: body.subject, html: body.html, again: body.again === true });
        return NextResponse.json({ ok: r.sent, sent: r.sent, alreadySent: r.alreadySent ?? false, detail: r.detail });
      }
      return NextResponse.json(await draftLandlordViewing(booking, actor));
    }

    if (body.kind === "viewing") {
      const booking = bookingFrom(body.booking);
      if (!booking) return NextResponse.json({ ok: false, error: "Which viewing, and when?" }, { status: 400 });
      if (body.action === "send") {
        /* Their copy only needs the calendar file when Outlook didn't take it. */
        const inAgentsCalendar = hasDb()
          ? (await q(`SELECT 1 FROM os_case_state WHERE kind = 'outlook-event' AND record_id = $1`, [viewingKey(booking)]).catch(() => [])).length > 0
          : false;
        const r = await sendViewingConfirmation({ me: actor, booking, origin, inAgentsCalendar, subject: body.subject, html: body.html, again: body.again === true });
        return NextResponse.json({ ok: r.applicant.sent, sent: r.applicant.sent, alreadySent: r.applicant.alreadySent ?? false, detail: r.applicant.detail });
      }
      return NextResponse.json(await draftViewingConfirmation(booking, actor, origin));
    }

    return NextResponse.json({ ok: false, error: "Which confirmation?" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "That didn't work." }, { status: 500 });
  }
}
