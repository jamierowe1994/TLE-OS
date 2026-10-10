import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { conversationFor, openEmail } from "@/lib/conversation";
import { landlordForListing } from "@/lib/rex-landlord";
import { testLandlord } from "@/lib/test-listing-answers";
import { isTestId } from "@/lib/test-overlay";

/**
 * A listing's Messages (10 Oct 2026): the conversation with its landlord -
 * emails both ways, texts, portal chat (lib/conversation). Who the landlord
 * is comes from the listing itself (lib/rex-landlord), never from the page,
 * so the route can only ever show what was said with that landlord.
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
    return NextResponse.json({ ok: true, items: [], notes: ["REX has no landlord on this listing, so there's no conversation to show."], landlord: null });
  }
  const emails = landlord.email ? [landlord.email] : [];
  const phones = landlord.phone ? [landlord.phone] : [];

  const open = req.nextUrl.searchParams.get("open");
  if (open) {
    const r = await openEmail(actor.id, viewingAs, open, emails);
    return "error" in r ? NextResponse.json({ ok: false, error: r.error }, { status: 404 }) : NextResponse.json({ ok: true, email: r });
  }
  if (!emails.length && !phones.length) {
    return NextResponse.json({ ok: true, items: [], notes: [`No email or mobile for ${landlord.name || "the landlord"} on REX, so there's no conversation to show.`], landlord: { name: landlord.name } });
  }
  const conv = await conversationFor({ userId: actor.id, viewingAs, emails, phones });
  return NextResponse.json({ ...conv, landlord: { name: landlord.name } });
}
