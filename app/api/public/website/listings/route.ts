import { NextRequest } from "next/server";
import { bookFor, cacheKeyFor, heldFor, FRESH_MS } from "@/lib/listings-cache";
import { websiteAuth, websiteError, websiteJson } from "../_lib/auth";
import { listingExtras } from "../_lib/listing-extras";
import { toWebsiteListing } from "../_lib/shape";

/**
 * GET /api/public/website/listings - the published rental book, for the
 * website. Bearer WEBSITE_API_TOKEN.
 *
 * Read-only, from the OS's own cached book (bookFor(null): everyone's book,
 * which is what a public site shows) plus the extras index. PUBLISHED ONLY:
 * more than half the book is draft and a draft must never reach the website.
 *
 * `stale` and `ageMs` say how old the book is; the website decides whether
 * to say so. `extras` says whether the agent / deposit / highlights index
 * was there: "fresh", "stale", or "missing" (REX refused and nothing held,
 * in which case every agent is null rather than the whole feed failing).
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const refused = websiteAuth(req);
  if (refused) return refused;
  try {
    const [book, held, extras] = await Promise.all([
      bookFor(null),
      heldFor(cacheKeyFor(null)),
      listingExtras().catch(() => null),
    ]);
    const at = held?.at ?? Date.now();
    const ageMs = Math.max(0, Date.now() - at);
    const index = extras?.value ?? {};
    const listings = book.listings
      .filter((l) => l.publicationStatus === "published")
      .map((l) => toWebsiteListing(l, index[l.id] ?? null));
    return websiteJson({
      ok: true,
      listings,
      counts: {
        published: listings.length,
        available: listings.filter((l) => !l.letAgreed).length,
        letAgreed: listings.filter((l) => l.letAgreed).length,
        withPhoto: listings.filter((l) => l.image).length,
        weekly: listings.filter((l) => l.rentPeriod === "week").length,
      },
      pulledAt: new Date(at).toISOString(),
      stale: ageMs >= FRESH_MS,
      ageMs,
      extras: extras ? (extras.stale ? "stale" : "fresh") : "missing",
    });
  } catch (err) {
    return websiteError(err);
  }
}
