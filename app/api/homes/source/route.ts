import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { scopeForWho } from "@/lib/scope";
import { addressBook } from "@/lib/assistant-steve-address";
import { bookFor } from "@/lib/listings-cache";
import { managedBookFor } from "@/lib/managed-book-cache";
import { propertySource, REX_SOURCES, setPropertySource } from "@/lib/rex-property-source";
import { rexTokenFor } from "@/lib/rex-user";
import { record } from "@/lib/audit";

/**
 * A home's Source - how the landlord came to us - read and set from the home's
 * page (Sean McMahon, 21 Oct 2026: a re-let of 68 Main Street was refused for
 * want of one, and nobody but the office could add it).
 *
 *   GET  ?property=<REX property id>  → { source: string | "" | null, options }
 *   POST { property, source }          → set it (lib/rex-property-source)
 *
 * Only for a home in the person's own book; owners and the office any.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function mayTouch(req: NextRequest, property: string) {
  const who = await whoIs(req);
  if (!who.actor) return { error: "Sign in first.", status: 401 } as const;
  if (!/^\d+$/.test(property)) return { error: "This home has no back-office record to hold a Source.", status: 400 } as const;
  const book = await addressBook(await scopeForWho(req, who), who.actor.role);
  if ("error" in book) return { error: book.error, status: 403 } as const;
  if (book.rex) {
    const [listings, managed] = await Promise.all([
      bookFor(book.rex).then((b) => b.listings).catch(() => []),
      managedBookFor(book.rex).then((m) => m.book.properties).catch(() => []),
    ]);
    const theirs = listings.some((l) => String(l.propertyId) === property) || managed.some((p) => String(p.propertyId) === property);
    if (!theirs) return { error: "That home isn't in your book.", status: 403 } as const;
  }
  return { me: who.actor } as const;
}

export async function GET(req: NextRequest) {
  const property = (req.nextUrl.searchParams.get("property") ?? "").trim();
  const a = await mayTouch(req, property);
  if ("error" in a) return NextResponse.json({ ok: false, error: a.error }, { status: a.status });
  const source = await propertySource(property).catch(() => null);
  return NextResponse.json({ ok: true, source, options: REX_SOURCES });
}

export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as { property?: unknown; source?: unknown };
  const property = typeof b.property === "string" ? b.property.trim() : "";
  const source = typeof b.source === "string" ? b.source.trim() : "";
  const a = await mayTouch(req, property);
  if ("error" in a) return NextResponse.json({ ok: false, error: a.error }, { status: a.status });
  const before = await propertySource(property).catch(() => null);
  const r = await setPropertySource(property, source, await rexTokenFor(a.me.id).catch(() => null));
  if (!r.ok) return NextResponse.json({ ok: false, error: r.detail }, { status: 409 });
  await record({ kind: "rex_property_source_set", actorId: a.me.id, actorEmail: a.me.email, subjectId: `rex-property:${property}`, detail: `"${before ?? "unreadable"}" -> "${source}"` });
  return NextResponse.json({ ok: true, source });
}
