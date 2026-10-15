import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { scopeForWho } from "@/lib/scope";
import { addressBook } from "@/lib/assistant-steve-address";
import { bookFor } from "@/lib/listings-cache";
import { managedBookFor } from "@/lib/managed-book-cache";
import { osHomeAddress } from "@/lib/os-property-address";

/**
 * GET ?property=<REX property id> → the address the OS holds for a home that
 * has no OS record of its own (lib/os-property-address), for the listing and
 * Portfolio pages to show beside the address they read from the listings
 * system. Only for a home in this person's book; owners and the office any.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const who = await whoIs(req);
  if (!who.actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const property = (req.nextUrl.searchParams.get("property") ?? "").trim();
  if (!property) return NextResponse.json({ ok: false, error: "Which home?" }, { status: 400 });
  const book = await addressBook(await scopeForWho(req, who), who.actor.role);
  if ("error" in book) return NextResponse.json({ ok: false, error: book.error }, { status: 403 });
  if (book.rex) {
    const [listings, managed] = await Promise.all([
      bookFor(book.rex).then((b) => b.listings).catch(() => []),
      managedBookFor(book.rex).then((m) => m.book.properties).catch(() => []),
    ]);
    const theirs = listings.some((l) => String(l.propertyId) === property) || managed.some((p) => String(p.propertyId) === property);
    if (!theirs) return NextResponse.json({ ok: false, error: "That home isn't in your book." }, { status: 403 });
  }
  const held = await osHomeAddress(property).catch(() => undefined);
  if (held === undefined) return NextResponse.json({ ok: false, error: "The OS address couldn't be read just now." }, { status: 502 });
  return NextResponse.json({ ok: true, address: held });
}
