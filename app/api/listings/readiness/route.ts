import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { rexConfigured } from "@/lib/rex";
import { publishGapsFor, type PublishGap } from "@/lib/listing-publish-check";

/**
 * GET ?ids=843312:2026-09-16,843400:2026-09-10 -> what each draft still needs
 * before it can go on the portals (17 Sep 2026).
 *
 * The board's "Ready to publish" asks this rather than guessing from photos
 * and the EPC, so the tile and the drawer's push button can never disagree.
 * Each id travels with the book's lastUpdated for it, which keys the cache.
 *
 * The board only sends drafts that look ready from the book itself, so this
 * is a handful at a time, not the whole book: every read is four calls.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX = 24;
const AT_ONCE = 2;

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!rexConfigured()) return NextResponse.json({ ok: false, error: "The listings system isn't connected here." }, { status: 503 });

  const asked = (req.nextUrl.searchParams.get("ids") ?? "")
    .split(",")
    .map((part) => {
      const [id, ...rest] = part.split(":");
      return { id: id.trim(), version: rest.join(":").trim() };
    })
    .filter((a) => /^\d+$/.test(a.id))
    .slice(0, MAX);
  if (!asked.length) return NextResponse.json({ ok: false, error: "Which listings?" }, { status: 400 });

  const results: Record<string, { gaps: PublishGap[] } | { failed: true }> = {};
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(AT_ONCE, asked.length) }, async () => {
      while (next < asked.length) {
        const a = asked[next++];
        try {
          results[a.id] = { gaps: await publishGapsFor(Number(a.id), a.version) };
        } catch {
          /* One listing that will not read is that tile's problem, not the board's. */
          results[a.id] = { failed: true };
        }
      }
    })
  );
  return NextResponse.json({ ok: true, results });
}
