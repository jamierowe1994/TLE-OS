import { NextRequest, NextResponse } from "next/server";
import { hasDb, q } from "@/lib/db";
import { heldForRex } from "@/lib/rex-jobs";
import { publicError } from "@/lib/public-error";
import { requireAnyCapability } from "@/lib/admin";
import { cacheKeyFor, heldFor, refresh } from "@/lib/listings-cache";
import { rexConfigured } from "@/lib/rex";
import { noteFailure } from "@/lib/auto-bugs";

/**
 * Each agent's listing book, read before they arrive (25 Nov 2026).
 *
 * Ticket 3ab61f63: Send Properties sat on "Loading" first thing in the
 * morning. The box reads the agent's OWN book (/api/listings, scoped to their
 * REX id), which is held for six hours and then thrown away - and nothing
 * re-read it overnight. The REX copy only ever touches the whole-office book.
 * So the first agent in each morning waited the full REX read, up to a
 * minute, while the box said Loading. Same shape as the compliance book
 * before /api/compliance/warm existed.
 *
 * Whose books: every unlocked, non-owner account linked to a REX agent that
 * opened Listings (or anything that reads it) in the last fortnight, plus the
 * whole-office book the owners and Steve read. One at a time, with a pause,
 * so REX sees an ordinary morning and not a burst. A book already fresh
 * within the hour is left alone.
 *
 * Read only: it fetches the books and stores them in the cache, nothing else.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const PACE_MS = 1_500;
const SKIP_IF_YOUNGER_MS = 60 * 60_000;
const ANSWER_BY_MS = 80_000;

async function scopes(): Promise<Array<string | null>> {
  if (!hasDb()) return [null];
  const rows = await q<{ rex_user_id: string }>(
    `SELECT DISTINCT u.rex_user_id
       FROM os_users u
      WHERE u.rex_user_id IS NOT NULL AND u.rex_user_id <> ''
        AND u.locked_at IS NULL AND u.role <> 'owner'
        AND EXISTS (
          SELECT 1 FROM os_read_log r
           WHERE r.user_id = u.id AND r.path = '/api/listings'
             AND r.at > NOW() - INTERVAL '14 days'
        )`
  ).catch(() => []);
  return [null, ...rows.map((r) => r.rex_user_id)];
}

interface Outcome {
  warmed: number;
  skipped: number;
  failed: number;
}

async function warmAll(list: Array<string | null>, out: Outcome): Promise<void> {
  for (const rexUserId of list) {
    const key = cacheKeyFor(rexUserId);
    const held = await heldFor(key).catch(() => null);
    if (held && Date.now() - held.at < SKIP_IF_YOUNGER_MS) {
      out.skipped += 1;
      continue;
    }
    try {
      await refresh(key, rexUserId);
      out.warmed += 1;
    } catch (e) {
      out.failed += 1;
      console.warn("[listings-warm] one book failed", rexUserId ?? "all", publicError(e, "REX read failed"));
    }
    await new Promise((r) => setTimeout(r, PACE_MS));
  }
  console.log(`[listings-warm] done: ${out.warmed} warmed, ${out.skipped} already fresh, ${out.failed} failed, of ${list.length}`);
  if (out.failed && out.failed === list.length - out.skipped) {
    noteFailure({ source: "REX", what: "morning listing books warm", message: `None of the ${out.failed} listing books could be read from REX this morning.` });
  }
}

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const offered = req.headers.get("x-cron-key") ?? "";
  const byCron = Boolean(secret && offered && offered === secret);
  const byPerson = !byCron && Boolean(await requireAnyCapability(req, ["see:everything"]));
  if (!byCron && !byPerson) {
    return NextResponse.json({ ok: false, error: "Not allowed." }, { status: 403 });
  }
  const held = await heldForRex(req, { rerunWhenBack: true });
  if (held) return held;
  if (!rexConfigured()) {
    return NextResponse.json({ ok: true, warmed: 0, reason: "REX isn't connected here." });
  }

  const started = Date.now();
  const list = await scopes();
  const out: Outcome = { warmed: 0, skipped: 0, failed: 0 };
  const run = warmAll(list, out).catch((e) => {
    console.error("[listings-warm] run failed", e);
  });
  /* Cloudflare hangs up at 100 seconds; answer before then and let the rest
     carry on, as /api/compliance/warm does. */
  const first = await Promise.race([run.then(() => "done" as const), new Promise<"still going">((r) => setTimeout(() => r("still going"), ANSWER_BY_MS))]);
  return NextResponse.json(
    { ok: true, books: list.length, ...out, finished: first === "done", tookMs: Date.now() - started, by: byCron ? "cron" : "person" },
    { status: first === "done" ? 200 : 202 }
  );
}
