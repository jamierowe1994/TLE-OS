import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { record } from "@/lib/audit";
import { requireAnyCapability } from "@/lib/admin";
import { peopleFeed } from "@/lib/marketing-people";

/**
 * GET /api/marketing/people  - who is on TLE OS and how they use it, for the
 * TEG Marketing Hub (James, 9 Nov 2026). Read only.
 *
 *   Authorization: Bearer <MARKETING_PEOPLE_KEY>     (or x-api-key: <key>)
 *
 * Names, work emails, roles, the set-up checklist, the Hub's job title and
 * package, and page counts (lib/marketing-people). Never a home address,
 * mobile, bio text, token or the read log.
 *
 * Its own key, not MARKETING_FEED_KEY: that one only ever gives counts, and
 * Haley's Base44 app holds it. This one carries names, so it lives only in the
 * Marketing Hub's Railway variables. Several keys may be set, comma separated,
 * so a new one can go in before the old one comes out. No key = feed shut.
 * Server to server only: no CORS header on purpose.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function keyed(req: NextRequest): string | null {
  const keys = (process.env.MARKETING_PEOPLE_KEY ?? "")
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
  const person = key ? null : await requireAnyCapability(req, ["see:people"]);
  if (!key && !person) {
    return NextResponse.json({ ok: false, error: "This feed needs its key." }, { status: 401, headers: { "cache-control": "no-store" } });
  }
  try {
    const feed = await peopleFeed();
    if (key) {
      const tag = `key ...${key.slice(-4)}`;
      const now = Date.now();
      if ((lastNoted.get(tag) ?? 0) < now - 3_600_000) {
        lastNoted.set(tag, now);
        await record({
          kind: "marketing_people_read",
          actorEmail: `marketing hub (${tag})`,
          detail: `${feed.on.length} on, ${feed.notYet.length} not yet`,
          ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "",
        });
      }
    }
    return NextResponse.json(feed, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "The people list did not load. Try again in a minute." }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}
