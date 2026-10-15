import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { rexConfigured } from "@/lib/rex";
import { publishGapsFor, type PublishGap } from "@/lib/listing-publish-check";

/**
 * GET ?ids=843312:<modified>,843400:<modified> -> what each draft still needs
 * before it can go on the portals (17 Sep 2026): { gaps }, { failed }, or
 * { pending } when it was not done inside the time budget below.
 *
 * The board's "Ready to publish" asks this rather than guessing from photos
 * and the EPC, so the tile and the drawer's push button can never disagree.
 * Each id travels with the listing's modified time, which keys the cache.
 *
 * The board only sends drafts that look ready from the book itself, so this
 * is a handful at a time, not the whole book: every read is four calls.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX = 24;
const AT_ONCE = 2;
/* ANSWER INSIDE THE TIMEOUT (15 Oct 2026, bug e8a23c44). Lianna's board sent
   up to 24 drafts and waited for every one; with REX slow that ran past
   Cloudflare's 100 seconds and the whole request came back 524, so no tile
   got its tick. maxDuration does nothing under next start. Now the request
   answers after this long with whatever is done, and marks the rest pending:
   their reads carry on here and are kept, so the board's next ask finds them. */
const BUDGET_MS = 25_000;

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

  const results: Record<string, { gaps: PublishGap[] } | { failed: true } | { pending: true }> = {};
  for (const a of asked) results[a.id] = { pending: true };
  let next = 0;
  let outOfTime = false;
  const work = Promise.all(
    Array.from({ length: Math.min(AT_ONCE, asked.length) }, async () => {
      while (next < asked.length && !outOfTime) {
        const a = asked[next++];
        try {
          const gaps = await publishGapsFor(Number(a.id), a.version);
          if (!outOfTime) results[a.id] = { gaps };
        } catch {
          /* One listing that will not read is that tile's problem, not the board's. */
          if (!outOfTime) results[a.id] = { failed: true };
        }
      }
    })
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([work, new Promise<void>((r) => (timer = setTimeout(r, BUDGET_MS)))]);
  clearTimeout(timer);
  outOfTime = true;
  return NextResponse.json({ ok: true, results: { ...results } });
}
