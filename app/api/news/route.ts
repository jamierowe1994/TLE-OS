import { NextResponse } from "next/server";

/**
 * Industry news, for the dashboard.
 *
 * Landlord Today publishes a proper RSS feed, so we read that rather than
 * scraping the page: a feed is a contract, and a scraper breaks the first
 * time somebody changes a class name.
 *
 * Cached for fifteen minutes. They post a few times a day, nobody needs it
 * fresher than that, and it means fifteen agents opening their dashboards
 * don't become fifteen requests to someone else's server.
 *
 * One source today. The shape is a list on purpose — adding Property
 * Industry Eye or LandlordZONE later is another entry, not a rewrite.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SOURCES: Record<string, { name: string; feed: string; site: string }> = {
  "landlord-today": {
    name: "Landlord Today",
    feed: "https://www.landlordtoday.co.uk/breaking-news/feed/",
    site: "https://www.landlordtoday.co.uk/breaking-news/",
  },
};

type Article = { title: string; link: string; at: string | null; blurb: string };

let cache: { at: number; key: string; items: Article[] } | null = null;
const TTL_MS = 15 * 60 * 1000;

const tag = (block: string, name: string): string => {
  const m = block.match(new RegExp(`<${name}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${name}>`));
  return m ? m[1].trim() : "";
};

const unentity = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("source") ?? "landlord-today";
  const src = SOURCES[id] ?? SOURCES["landlord-today"];

  if (cache && cache.key === id && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json({ ok: true, source: src.name, site: src.site, items: cache.items });
  }

  try {
    const res = await fetch(src.feed, {
      headers: { "user-agent": "TLE-OS/1.0 (dashboard news reader)" },
      cache: "no-store",
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) throw new Error(`Feed answered ${res.status}`);
    const xml = await res.text();

    const items: Article[] = [];
    for (const block of xml.split("<item>").slice(1, 9)) {
      const title = unentity(tag(block, "title").replace(/<[^>]+>/g, ""));
      const link = tag(block, "link").replace(/<[^>]+>/g, "").trim();
      if (!title || !link) continue;
      const blurb = unentity(tag(block, "description").replace(/<[^>]+>/g, " "))
        // WordPress tacks "The post X appeared first on Y" onto every
        // description. It is boilerplate in every single item and reads as
        // noise in a three-line card.
        .replace(/\s*The post\s.*$/s, "")
        .replace(/\s+/g, " ")
        .trim();
      const at = tag(block, "pubDate");
      items.push({ title, link, at: at ? new Date(at).toISOString() : null, blurb });
    }

    cache = { at: Date.now(), key: id, items };
    return NextResponse.json({ ok: true, source: src.name, site: src.site, items });
  } catch (e) {
    // Somebody else's website being down is not our outage: serve whatever
    // was last read rather than an empty box.
    if (cache?.key === id) {
      return NextResponse.json({ ok: true, stale: true, source: src.name, site: src.site, items: cache.items });
    }
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "The feed didn't answer." },
      { status: 502 }
    );
  }
}
