import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { conversationFor, openEmail } from "@/lib/conversation";
import { homeForListing } from "@/lib/home-refs";
import { landlordForListing } from "@/lib/rex-landlord";
import { testLandlord } from "@/lib/test-listing-answers";
import { isTestId } from "@/lib/test-overlay";

/**
 * A listing's Messages (10 Oct 2026): the conversation with its landlord -
 * emails both ways, texts, portal chat (lib/conversation). Who the landlord
 * is comes from the listing itself (lib/rex-landlord), never from the page,
 * so the route can only ever show what was said with that landlord - and of
 * that, what is about THIS home: emails quoting another of their homes'
 * references go to that home (lib/home-refs, Howard 14 Oct 2026).
 *
 *   GET            the stream, with { landlord } to name them
 *   GET ?open=<id> one email in full, with its thread
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { actor, viewingAs } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });

  /* REX not answering is a reason to say so, not a crash. */
  const answer = await (isTestId(id) ? testLandlord(Number(id)) : landlordForListing(id)).catch(() => null);
  if (!answer || !answer.ok) {
    return NextResponse.json({ ok: false, error: "We couldn't tell who the landlord is just now, so their messages can't be shown." }, { status: 502 });
  }
  const landlord = answer.landlord;
  if (!landlord) {
    return NextResponse.json({ ok: true, items: [], notes: ["No landlord is held for this home, so there's no conversation to show. Add them under Landlord on the listing."], landlord: null });
  }
  /* Every landlord of the home (lib/landlords-for-home, 10 Nov 2026): an email
     from the second owner is part of the listing's conversation too. A test
     listing has its one landlord. */
  const everyone = "landlords" in answer && answer.landlords.length ? answer.landlords : [landlord];
  const emails = [...new Set(everyone.map((l) => (l.email ?? "").trim()).filter(Boolean))];
  const phones = [...new Set(everyone.map((l) => (l.phone ?? "").trim()).filter(Boolean))];

  const open = req.nextUrl.searchParams.get("open");
  if (open) {
    const r = await openEmail(actor.id, viewingAs, open, emails);
    return "error" in r ? NextResponse.json({ ok: false, error: r.error }, { status: 404 }) : NextResponse.json({ ok: true, email: r });
  }
  if (!emails.length && !phones.length) {
    return NextResponse.json({ ok: true, items: [], notes: [`No email or mobile is held for ${landlord.name || "the landlord"}, so there's no conversation to show. Add one under Landlord on the listing.`], landlord: { name: landlord.name } });
  }
  const home = isTestId(id) ? null : await homeForListing(id).catch(() => null);
  const conv = await conversationFor({ userId: actor.id, viewingAs, emails, phones, home });
  return NextResponse.json({ ...conv, landlord: { name: landlord.name } });
}
