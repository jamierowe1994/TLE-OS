import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { scopeForWho } from "@/lib/scope";
import { addressBook } from "@/lib/assistant-steve-address";
import { bookFor } from "@/lib/listings-cache";
import { forgetBooks, managedBookFor } from "@/lib/managed-book-cache";
import { addressParts, osHomeAddress, osRecordFor, saveOsAddress, saveOsHomeAddress } from "@/lib/os-property-address";
import { record } from "@/lib/audit";

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

/**
 * POST { property, listingId?, address } - change a home's address in the OS
 * from the screen (Kayleigh Wright, 15 Oct 2026: a town or postcode missing
 * on the back-office record stopped an offer reaching Propoly; James, 23 Oct:
 * "allow them to do the edit on the system" rather than ask Steve). The same
 * write Steve's address card makes (lib/assistant-actions doAddress): a home
 * with its own OS record changes that record, any other home gets the OS's
 * address row for its REX property, which the Propoly push reads wherever the
 * back office has no town or postcode. Nothing is written to REX.
 */
export async function POST(req: NextRequest) {
  const who = await whoIs(req);
  const me = who.actor;
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { property?: unknown; listingId?: unknown; address?: unknown };
  const property = typeof b.property === "string" ? b.property.trim() : "";
  const listingId = typeof b.listingId === "string" && b.listingId.trim() ? b.listingId.trim() : null;
  if (!property) return NextResponse.json({ ok: false, error: "Which home?" }, { status: 400 });
  const parts = addressParts(typeof b.address === "string" ? b.address : "");
  if ("error" in parts) return NextResponse.json({ ok: false, error: parts.error.replace(/\bI need\b/, "It needs").replace(/\bI can read\b/, "the OS can read").replace(/Give me/, "Put in") }, { status: 400 });
  const book = await addressBook(await scopeForWho(req, who), me.role);
  if ("error" in book) return NextResponse.json({ ok: false, error: book.error }, { status: 403 });
  const [listings, managed] = await Promise.all([
    bookFor(book.rex).then((x) => x.listings).catch(() => []),
    managedBookFor(book.rex).then((m) => m.book.properties).catch(() => []),
  ]);
  const home = managed.find((p) => String(p.propertyId) === property || (listingId && p.listingId === listingId)) ?? null;
  const theirs = Boolean(home) || listings.some((l) => String(l.propertyId) === property);
  if (!theirs) return NextResponse.json({ ok: false, error: "That home isn't in your book." }, { status: 403 });
  const rec = home ? await osRecordFor(home).catch(() => null) : null;
  let before: string | null;
  let subject: string;
  if (rec) {
    const saved = await saveOsAddress(rec.id, parts);
    if (!saved) return NextResponse.json({ ok: false, error: "That didn't save. Try again in a moment." }, { status: 500 });
    before = saved.before;
    subject = rec.id;
  } else {
    if (!/^\d+$/.test(property)) return NextResponse.json({ ok: false, error: "This home has no record the OS can hold an address against." }, { status: 400 });
    before = (await saveOsHomeAddress(property, listingId ?? home?.listingId ?? null, parts, { id: me.id, name: me.name || me.email })).before;
    subject = `rex-property:${property}`;
  }
  await forgetBooks();
  await record({ kind: "property_address_changed", actorId: me.id, actorEmail: me.email, subjectId: subject, detail: `${before ?? "(none)"} -> ${parts.address} (on screen)` });
  return NextResponse.json({ ok: true, address: { address: parts.address, setBy: me.name || me.email, setAt: new Date().toISOString() }, alsoElsewhere: rec ? rec.linked : true });
}
