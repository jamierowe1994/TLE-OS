import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { mayOfferOn, NOT_YOURS } from "@/lib/offer-access";
import { assertNotViewingAs, ViewingAsRefused, VIEW_AS_COOKIE } from "@/lib/view-as";
import { landlordOfferEmail, landlordSends, landlordTo, OfferEmailRefused, offerForLandlord, sendLandlordOffer } from "@/lib/offer-landlord-email";

/**
 * POST /api/offers/landlord-email { ref, listingId, line?, send? }
 *
 * The offer, put to the landlord by the agent (ticket 0268fdcc, 15 Oct 2026).
 * Without send: the email as it would go - who to, the subject, the HTML for
 * the preview - and when it last went. With send: true, it goes, through
 * sendAsAgent and the customer email switch (lib/offer-landlord-email). The
 * offer and the landlord are read here, never taken from the page.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const who = hasDb() ? await whoIs(req).catch(() => null) : null;
  const actor = who?.actor ?? null;
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });

  const b = (await req.json().catch(() => ({}))) as { ref?: unknown; listingId?: unknown; line?: unknown; send?: unknown };
  const ref = typeof b.ref === "string" && /^(os|rex|test):[\w-]{1,80}$/.test(b.ref) ? b.ref : null;
  const listingId = /^-?\d{1,12}$/.test(String(b.listingId ?? "")) ? String(b.listingId) : null;
  if (!ref || !listingId) return NextResponse.json({ ok: false, error: "Which offer?" }, { status: 400 });
  if (!(await mayOfferOn(req, who, listingId))) return NextResponse.json({ ok: false, error: NOT_YOURS }, { status: 403 });
  const line = typeof b.line === "string" ? b.line.slice(0, 1500) : "";

  if (b.send === true) {
    try {
      assertNotViewingAs(req.cookies.get(VIEW_AS_COOKIE)?.value);
    } catch (e) {
      if (e instanceof ViewingAsRefused) return NextResponse.json({ ok: false, error: e.message }, { status: 423 });
      throw e;
    }
  }

  try {
    const [offer, to] = await Promise.all([offerForLandlord(ref, listingId), landlordTo(listingId)]);
    if (b.send !== true) {
      const { subject, html } = landlordOfferEmail(offer, to, actor, line);
      const last = (await landlordSends([ref])).get(ref) ?? null;
      return NextResponse.json({ ok: true, to, subject, html, last });
    }
    if (!to.email) return NextResponse.json({ ok: false, error: to.problem ?? "There is no email address for the landlord." }, { status: 409 });
    const r = await sendLandlordOffer(actor, offer, to, line);
    return NextResponse.json({ ok: r.sent, sent: r.sent, detail: r.detail, error: r.sent ? undefined : r.detail });
  } catch (e) {
    if (e instanceof OfferEmailRefused) return NextResponse.json({ ok: false, error: e.message }, { status: 404 });
    console.error("landlord offer email failed", e);
    return NextResponse.json({ ok: false, error: "That didn't work. Try again, or ring the landlord." }, { status: 500 });
  }
}
