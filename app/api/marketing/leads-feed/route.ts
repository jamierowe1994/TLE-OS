import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { record } from "@/lib/audit";
import { requireAnyCapability } from "@/lib/admin";
import { leadFeed, readFeedQuery } from "@/lib/marketing-feed";

/**
 * GET /api/marketing/leads-feed  - the lead figures for marketing's own app.
 *
 *   Authorization: Bearer <MARKETING_FEED_KEY>     (or x-api-key: <key>)
 *   ?from=YYYY-MM-DD&to=YYYY-MM-DD&group=day|week|month&includeDiary=1
 *
 * Counts and sources only (lib/marketing-feed): how many leads, from where,
 * tenant or landlord, by day/week/month, area, stage and advertised home. No
 * name, email or phone, by James's choice (12 Oct 2026), so a key that leaks
 * gives away figures and never a contact list.
 *
 * Built for Hayley's Base44 app. Call it from a Base44 backend function, not
 * the page: there is deliberately no CORS header, so the key cannot sit in a
 * browser where anybody could read it.
 *
 * MARKETING_FEED_KEY may hold several keys separated by commas, so a new one
 * can go in before the old one comes out. No key set = the feed is shut.
 * An owner or marketing person signed in can open it in a browser as well.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function keyed(req: NextRequest): string | null {
  const keys = (process.env.MARKETING_FEED_KEY ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length >= 24);
  if (!keys.length) return null;
  const auth = req.headers.get("authorization") ?? "";
  const given = (auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : req.headers.get("x-api-key") ?? "").trim();
  if (!given) return null;
  const g = Buffer.from(given);
  for (const k of keys) {
    const b = Buffer.from(k);
    if (b.length === g.length && timingSafeEqual(b, g)) return k;
  }
  return null;
}

/* One line in Admin > Activity per key per hour, not one per poll. */
const lastNoted = new Map<string, number>();

export async function GET(req: NextRequest) {
  const key = keyed(req);
  const person = key ? null : await requireAnyCapability(req, ["see:marketing", "see:business"]);
  if (!key && !person) {
    return NextResponse.json({ ok: false, error: "This feed needs its key." }, { status: 401, headers: { "cache-control": "no-store" } });
  }

  const query = readFeedQuery(req.nextUrl.searchParams);
  if ("error" in query) return NextResponse.json({ ok: false, error: query.error }, { status: 400 });

  try {
    const feed = await leadFeed(query);
    if (key) {
      const tag = `key ...${key.slice(-4)}`;
      const now = Date.now();
      if ((lastNoted.get(tag) ?? 0) < now - 3_600_000) {
        lastNoted.set(tag, now);
        await record({ kind: "marketing_feed_read", actorEmail: `marketing feed (${tag})`, detail: `${feed.range.from} to ${feed.range.to}`, ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "" });
      }
    }
    return NextResponse.json(feed, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof RangeError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    return NextResponse.json({ ok: false, error: "The lead figures did not load. Try again in a minute." }, { status: 502 });
  }
}
