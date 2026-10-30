import "server-only";
import { hasDb, q } from "@/lib/db";
import { bookFor } from "@/lib/listings-cache";
import { managedBookFor } from "@/lib/managed-book-cache";
import { assembled } from "@/lib/applications-board";
import { isOsPropertyId } from "@/lib/os-properties";
import { bestOf, homeRec, letsOn, listingRec, type HomeLinks, type Rec } from "@/lib/home-links-match";

export type { HomeLinks } from "@/lib/home-links-match";

/**
 * One home, its other records (Michael and Lianna, team call 29 Oct 2026).
 *
 * Searching 68 Main Street brought up its listing and its managed home as two
 * rows, and once on one there was no way across to the other - the listing
 * didn't show under Portfolio, and the let in progress was hard to find from
 * the home. So both pages carry a toggle (components/HomeSwitch): Listing,
 * Managed home, Let in progress, each only where it exists. How two records
 * are judged the same home is lib/home-links-match.
 *
 * Scoped like each page: the listings an agent's own board holds, the homes
 * their own Portfolio holds, the lets their own Applications board holds.
 */

/** REX's property id behind an OS home's pm- id. */
async function rexIds(ids: (string | null)[]): Promise<Map<string, string>> {
  const own = [...new Set(ids.filter((x): x is string => isOsPropertyId(x)))];
  const out = new Map<string, string>();
  if (!own.length || !hasDb()) return out;
  const rows = await q<{ id: string; rex_property_id: string | null }>(`SELECT id, rex_property_id FROM os_properties WHERE id = ANY($1)`, [own]).catch(() => []);
  for (const r of rows) if (r.rex_property_id) out.set(r.id, String(r.rex_property_id));
  return out;
}

export async function homeLinksFor(
  me: Rec & { from: "listing" | "home" },
  /** false: an account not linked to a REX user, whose book is nobody's. */
  scope: { listings: string | null | false; homes: string | null | false }
): Promise<HomeLinks> {
  const [book, managed, apps] = await Promise.all([
    me.from === "home" && scope.listings !== false ? bookFor(scope.listings).catch(() => null) : null,
    me.from === "listing" && scope.homes !== false ? managedBookFor(scope.homes).then((m) => m.book).catch(() => null) : null,
    /* The Applications board's own held copy: the same lets, closed the same way. */
    scope.listings !== false ? assembled(scope.listings).then((b) => b.held.value).catch(() => null) : null,
  ]);
  const listings = book?.listings ?? [];
  const homes = managed?.properties ?? [];
  const rex = await rexIds([me.propertyId, ...homes.map((h) => h.propertyId), ...listings.map((l) => l.propertyId)]);

  const listing = bestOf(me, listings, listingRec, rex);
  const home = bestOf(me, homes, homeRec, rex);

  /* Not closed (moved in, home let to somebody else, withdrawn); the newest. */
  const listingIds = new Set([me.listingId, listing ? String(listing.id) : null].filter((x): x is string => Boolean(x)));
  const open = letsOn(me, listingIds, apps?.applications ?? [], rex)
    .filter((a) => !apps?.closed.has(a.id)).sort((x, y) => (y.dateReceived ?? "").localeCompare(x.dateReceived ?? ""));
  const lets = open[0] ?? null;

  return {
    listing: listing ? { href: `/listings/${encodeURIComponent(String(listing.id))}` } : null,
    home: home ? { href: `/portfolio/${encodeURIComponent(String(home.listingId))}` } : null,
    let: lets ? { href: `/applications/${encodeURIComponent(lets.id)}`, hint: lets.applicants.map((x) => x.name).filter(Boolean).join(", ") || null } : null,
  };
}
