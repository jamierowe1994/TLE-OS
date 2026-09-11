import { NextRequest, NextResponse } from "next/server";
import { matchProperty } from "@/lib/property-match";
import { rexCall, rexConfigured, rexRows } from "@/lib/rex";
import { toListing, type OsListing, type RexListing } from "@/lib/rex-listings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * What OUR book knows about one address: every listing we have ever raised
 * against it, in every state, with its photographs.
 *
 * James, 11 Sep 2026, on the builder's Property step: "pull previous listing
 * information to see what it was listed at before, and see if it was let. Has
 * it been on the market recently?" Homesearch cannot answer that - it has no
 * per-property listing history (every guess at one 404s, measured the same
 * day), and its search ignores a property id. REX can, for the properties
 * that have been through our hands: the address is matched to a REX property
 * with the same matcher the compliance work uses, then its listings are read
 * without a state filter, so leased and withdrawn ones come back too.
 *
 * Read-only against REX, like everything else in the OS.
 */
export type PropertyHistoryRow = OsListing & {
  /** REX's own listing state: current, leased, withdrawn, archived… */
  state: string | null;
};

export async function GET(req: NextRequest) {
  const address = (req.nextUrl.searchParams.get("address") ?? "").trim();
  const postcode = (req.nextUrl.searchParams.get("postcode") ?? "").trim();
  if (!address) return NextResponse.json({ ok: false, error: "address required" }, { status: 400 });
  if (!rexConfigured()) {
    return NextResponse.json({ ok: true, configured: false, verdict: "no match", how: "REX is not connected here", listings: [] });
  }

  const full = postcode && !address.toUpperCase().includes(postcode.toUpperCase()) ? `${address} ${postcode}` : address;
  const match = await matchProperty(full);
  /* Only a confident match is worth showing. A "check" match on the Property
     step would put a neighbour's rent history in front of an agent who is
     about to quote it to a landlord. */
  const ids = match.verdict === "confident" ? match.targets.map((t) => t.id) : [];

  const listings: PropertyHistoryRow[] = [];
  for (const id of ids.slice(0, 3)) {
    const res = await rexCall("Listings", "search", {
      criteria: [
        { name: "property_id", value: id },
        { name: "listing_category_id", value: "residential_rental" },
      ],
      limit: 20,
      order_by: { system_publication_time: "desc" },
      extra_options: { extra_fields: ["related.listing_images", "related.listing_adverts"] },
    }).catch(() => null);
    if (!res?.ok) continue;
    for (const raw of rexRows(res.result) as RexListing[]) {
      listings.push({ ...toListing(raw), state: raw.system_listing_state ?? null });
    }
  }

  return NextResponse.json({
    ok: true,
    configured: true,
    verdict: match.verdict,
    how: match.how,
    property: ids.length ? match.targets[0] : null,
    listings,
  });
}
