import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { managedBookFor } from "@/lib/managed-book-cache";
import { currentLets } from "@/lib/current-lets";
import { searchMatches, searchRank } from "@/lib/search-match";
import { sameHome } from "@/lib/address-parse";
import { publicError } from "@/lib/public-error";

/**
 * Homes already on our books, for the landlord lead's address search (Dan
 * Richards, 17 Oct 2026, ticket f252e21d): "the address search bar should
 * also search the properties already in our own property records ... so we
 * can add them either as a contact or a co-owner" instead of a second file
 * for a home we already manage.
 *
 *   GET ?q=<typed>        homes whose address has every word typed
 *   GET ?address=<full>   the home at that address, from the lookup's answer
 *
 * The whole managed book, not only the agent's own: the person may be
 * ringing about a colleague's home. One home at a time and the landlord's
 * name only, never their email or phone, so it is no contact list.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export type OurHome = { propertyId: string; listingId: string; address: string; landlord: string | null; agent: string | null };

export async function GET(req: NextRequest) {
  const who = hasDb() ? await whoIs(req).catch(() => null) : null;
  if (!who?.actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const typed = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 120);
  const full = (req.nextUrl.searchParams.get("address") ?? "").trim().slice(0, 300);
  if (typed.length < 3 && !full) return NextResponse.json({ ok: true, homes: [] });
  try {
    const { book } = await managedBookFor(null);
    const lets = currentLets(book.properties).filter((p) => p.propertyId && !p.test);
    const line = (p: (typeof lets)[number]) => [p.name, p.locality, p.postcode && !p.locality.includes(p.postcode) ? p.postcode : null].filter(Boolean).join(", ");
    const hits = full
      ? lets.filter((p) => sameHome(line(p), full))
      : lets.filter((p) => searchMatches(typed, p.name, p.locality, p.postcode)).sort((a, b) => searchRank(typed, line(b)) - searchRank(typed, line(a)));
    /* Rooms of one house share a property id: one row for the house. */
    const seen = new Set<string>();
    const homes: OurHome[] = [];
    for (const p of hits) {
      if (seen.has(p.propertyId!)) continue;
      seen.add(p.propertyId!);
      homes.push({ propertyId: p.propertyId!, listingId: String(p.listingId), address: line(p), landlord: p.landlord?.name ?? null, agent: p.agent?.name ?? null });
      if (homes.length >= 5) break;
    }
    return NextResponse.json({ ok: true, homes });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "Our homes couldn't be searched just now.") }, { status: 500 });
  }
}
