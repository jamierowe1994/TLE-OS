import { rexCall } from "./rex";

/**
 * Where a listing actually IS, on the public portals.
 *
 * REX keeps one ListingPortalUploads row per listing per portal feed, and the
 * row carries `link_on_portal` — the real advert URL, as the portal itself
 * issued it after ingesting the feed. That is the only trustworthy source for
 * these links. The alternative is building a URL from an id, and portal URL
 * shapes are theirs to change; a constructed link is a 404 waiting for a
 * redesign. Measured 14 Aug 2026 on the live book:
 *
 *   Rightmove    https://www.rightmove.com/properties/92029194
 *   OnTheMarket  https://www.onthemarket.com/details/20141943
 *   Zoopla       https://www.zoopla.co.uk/realtime-listings/<64-char hash>
 *
 * Two things worth not rediscovering:
 *
 *   • Rightmove hands back a .com host that 301s to .co.uk. It is left exactly
 *     as REX stores it — rewriting a third party's URL to look tidier is how
 *     you own a bug the day they change the redirect.
 *   • Zoopla's realtime-listings URL 403s to curl and resolves perfectly in a
 *     browser. It is bot protection, not a dead link. Do not "fix" it.
 *
 * Bricks & Logic feeds every listing on this account and stores no link at
 * all, so it falls out naturally: no link, no button.
 */

/** Fixed order, so the buttons never reshuffle between properties. */
const ORDER = ["Rightmove", "Zoopla", "OnTheMarket"];

export type PortalLink = {
  /** As REX names it — "Rightmove", "Zoopla", "OnTheMarket". */
  portal: string;
  url: string;
  /** The portal's own id for the advert, handy when one needs chasing. */
  remoteId: string | null;
};

type UploadRow = {
  feed_status?: string | null;
  link_on_portal?: string | null;
  remote_id_on_portal?: string | null;
  portal_profile?: { portal_definition?: { portal_name?: string | null } | null } | null;
};

/**
 * Links change roughly never — a listing gets its Rightmove URL on first feed
 * and keeps it — so unlike every figure on this platform these are cached, and
 * that is a deliberate exception rather than an oversight. A stale VIEW COUNT
 * misinforms someone; a stale URL still opens the right advert.
 */
const TTL_MS = 30 * 60 * 1000;
const memory = new Map<string, { links: PortalLink[]; at: number }>();

function rowsOf(result: unknown): UploadRow[] {
  if (Array.isArray(result)) return result as UploadRow[];
  const rows = (result as { rows?: unknown } | null)?.rows;
  return Array.isArray(rows) ? (rows as UploadRow[]) : [];
}

export async function portalLinksFor(listingId: string | number): Promise<PortalLink[]> {
  const id = String(listingId);
  const held = memory.get(id);
  if (held && Date.now() - held.at < TTL_MS) return held.links;

  const res = await rexCall("ListingPortalUploads", "search", {
    criteria: [{ name: "listing_id", value: Number(id) }],
    limit: 25,
  });
  if (!res.ok) throw new Error(res.error ?? `REX wouldn't answer (${res.status}).`);

  const links: PortalLink[] = [];
  for (const row of rowsOf(res.result)) {
    /* Only feeds that are actually live. A "stopped" feed's link points at an
       advert the portal has already pulled down, and a button onto a withdrawn
       listing is worse than no button at all. */
    if (row.feed_status !== "feeding") continue;
    const url = String(row.link_on_portal ?? "").trim();
    if (!url.startsWith("http")) continue;
    const portal = String(row.portal_profile?.portal_definition?.portal_name ?? "").trim();
    if (!portal) continue;
    /* No per-portal date: REX's upload rows carry no timestamp, even as
       extra fields (probed 4 Sep 2026). The go-live day lives on the listing. */
    links.push({
      portal,
      url,
      remoteId: row.remote_id_on_portal ? String(row.remote_id_on_portal) : null,
    });
  }

  links.sort((a, b) => {
    const ai = ORDER.indexOf(a.portal);
    const bi = ORDER.indexOf(b.portal);
    /* Anything we haven't named goes after the three that matter, alphabetically. */
    if (ai === -1 && bi === -1) return a.portal.localeCompare(b.portal);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  memory.set(id, { links, at: Date.now() });
  return links;
}
