import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { conversationFor, openEmail } from "@/lib/conversation";
import { letPeople } from "@/lib/let-people";
import { homeForListing } from "@/lib/home-refs";
import { isTestId } from "@/lib/test-overlay";

/**
 * A let's conversation with one of its people (12 Oct 2026): emails both
 * ways, texts and portal chat (lib/conversation), for the tenant and landlord
 * drawers on the let's page. Who they are comes from the let (lib/let-people),
 * never from the page.
 *
 *   GET ?with=tenant&i=<n> | ?with=landlord        the stream
 *   GET ...&open=<email id>                         one email in full
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { actor, viewingAs } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const r = await letPeople(id, actor);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });

  const sp = req.nextUrl.searchParams;
  const person =
    sp.get("with") === "landlord"
      ? r.let.landlord
      : r.let.tenants[Math.max(0, Number(sp.get("i") ?? 0) || 0)] ?? null;
  if (!person) return NextResponse.json({ ok: true, items: [], notes: ["Nobody is held for them on this let, so there's no conversation to show."] });
  const emails = person.email ? [person.email] : [];
  const phones = person.phone ? [person.phone] : [];

  const open = sp.get("open");
  if (open) {
    const e = await openEmail(actor.id, viewingAs, open, emails);
    return "error" in e ? NextResponse.json({ ok: false, error: e.error }, { status: 404 }) : NextResponse.json({ ok: true, email: e });
  }
  if (!emails.length && !phones.length) {
    return NextResponse.json({ ok: true, items: [], notes: [`No email or mobile for ${person.name || "them"}, so there's no conversation to show.`] });
  }
  /* The landlord may have other homes with us: their emails are sorted by
     this let's home reference (lib/home-refs). A tenant's are all this let's. */
  const listingId = r.let.listingId;
  const home = sp.get("with") === "landlord" && listingId && !isTestId(listingId) ? await homeForListing(listingId).catch(() => null) : null;
  return NextResponse.json(await conversationFor({ userId: actor.id, viewingAs, emails, phones, home }));
}
