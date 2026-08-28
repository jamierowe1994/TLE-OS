import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { requireCapability } from "@/lib/admin";
import { getGciHistory, MONEY_FLOOR } from "@/lib/business/gci-history";
import { getHistory } from "@/lib/business/business-history";
import { currentMonth } from "@/lib/business/format";
import { q } from "@/lib/db";

/**
 * The one big sweep: walk every closed month once, and never walk it again.
 *
 * POST /api/business/backfill[?months=1][&from=YYYY-MM]
 *   → { done, frozen, remaining, nextFrom, tookMs }
 *
 * James: "go through every single month with one big sweep and then just store
 * them all locally, so then we don't have to worry about doing that again."
 *
 * ── Why this is RESUMABLE and not actually one request ────────────────────
 *
 * Because one request cannot do it, and pretending otherwise is how you get a
 * half-finished archive with no record of where it stopped. PayProp clamps
 * every page to 25 rows, so a single month across both agencies is ~1,400 rows
 * ≈ 56 sequential requests. From MONEY_FLOOR (Jan 2022) that is well over
 * 3,000 requests — hours, against a maxDuration ceiling of 800 seconds.
 *
 * So each call takes a BOUNDED bite (default ONE month), freezes what it got,
 * and reports `remaining` and `nextFrom`. Call it until `done` is true. A
 * killed request costs you that bite and nothing else, because everything
 * earlier is already frozen in Postgres.
 *
 * ── Why the bite is one month, not six ────────────────────────────────────
 *
 * The default was 6 and it never returned. Measured on the live site 28 Aug
 * 2026: curl came back with an EMPTY body, which is a request killed in
 * flight, not an error the app ever saw.
 *
 * `maxDuration = 800` below is the SERVERLESS ceiling. It is not the only
 * ceiling. Railway's edge proxy gives up on a request long before that —
 * around five minutes — so the handler is still working when the connection
 * is already gone. Raising maxDuration cannot help; nobody is listening.
 *
 * The backfill allows up to 3 minutes per month (PER_MONTH_WAIT_MS in
 * gci-history). Six months therefore WANTS up to 18 minutes against a proxy
 * that grants about five. One month fits with room to spare, and the caller
 * loops.
 *
 * The lesson worth keeping: a timeout you control is not the timeout that
 * decides. Size the bite to the shortest ceiling in the chain, which is
 * whichever proxy, load balancer or CDN sits in front — not the one in your
 * own config.
 *
 * ── Why it doesn't need a new table ───────────────────────────────────────
 *
 * The archive already exists, twice. `gci_months` holds the money and
 * `history_funnels` holds the counts, both keyed by month, both written the
 * moment a month closes and read forever after. Neither was ever swept
 * backwards — they only ever froze months that happened to be looked at. This
 * route is the sweep they were always missing, not a third store.
 *
 * ── What it refuses to freeze ─────────────────────────────────────────────
 *
 * Anything incomplete. getGciHistory's own `complete()` will not freeze a
 * month with an unreachable agency, because a month short by a whole agency
 * looks exactly like a bad month, and freezing it would make a temporary
 * credential failure permanent. Those months come back in `missed` and a later
 * call retries them. The current month is never frozen at all — it is still
 * accumulating.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/* Kept high, but do NOT read this as "a request may take 800 seconds" — see
   the note above. Railway's proxy closes the connection first, so this is a
   backstop for the function, not a promise to the caller. The bite size is
   what actually keeps a call inside the real limit. */
export const maxDuration = 800;

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** A cron key or a signed-in owner. Constant-time, so the key can't be
 *  guessed a character at a time. */
async function authorised(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET ?? "";
  const given = req.headers.get("x-cron-secret") ?? "";
  if (secret && given) {
    const a = Buffer.from(secret);
    const b = Buffer.from(given);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return Boolean(await requireCapability(req, "see:business"));
}

/** Every month from `from` to `to` inclusive. */
function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number);
  for (let guard = 0; guard < 600; guard++) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    if (key > to) break;
    out.push(key);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

export async function POST(req: NextRequest) {
  if (!(await authorised(req))) {
    return NextResponse.json({ ok: false, error: "Not allowed." }, { status: 403 });
  }

  const p = req.nextUrl.searchParams;
  const from = MONTH_RE.test(p.get("from") ?? "") ? p.get("from")! : MONEY_FLOOR;
  /* One month per call by default. Bigger bites are still allowed — pass
     ?months=N — but they only make sense somewhere without a five-minute
     proxy in front, so the default is the one that works HERE. */
  const bite = Math.min(Math.max(Number(p.get("months") ?? 1) || 1, 1), 24);

  /* Never the current month: it is still accumulating, and freezing a
     part-month would archive a bad month as a fact. */
  const live = currentMonth();
  const all = monthRange(from, live).filter((m) => m < live);
  if (!all.length) {
    return NextResponse.json({ ok: true, done: true, frozen: [], remaining: 0, note: "Nothing closed to sweep." });
  }

  /* What is already in the archive. Asked of Postgres rather than tracked in a
     progress table, because the archive IS the progress: a month with a row is
     done, whoever put it there and whenever. */
  let already = new Set<string>();
  try {
    const rows = await q<{ month: string }>(
      `SELECT month FROM gci_months WHERE month >= $1 AND month < $2`,
      [from, live]
    );
    already = new Set(rows.map((r) => r.month));
  } catch {
    /* No table yet, or no DB. Treat everything as outstanding — the walk is
       idempotent, so the cost of being wrong here is time, not correctness. */
  }

  const outstanding = all.filter((m) => !already.has(m));
  if (!outstanding.length) {
    return NextResponse.json({
      ok: true, done: true, frozen: [], remaining: 0,
      note: `All ${all.length} closed months since ${from} are already stored.`,
    });
  }

  const batch = outstanding.slice(0, bite);
  const started = Date.now();

  /* ONE walk across the span, not one per month. getGciHistory keys its cache
     on the range, so six separate month calls would be six distinct ranges and
     six separate walks of overlapping data.

     `wait: true` is not optional. Without it a cold key returns null and
     computes behind, and this route would report a triumphant zero-length
     freeze while the real work carried on invisibly. */
  const by = await getGciHistory(batch[0], batch[batch.length - 1], { wait: true }).catch(
    () => ({}) as Awaited<ReturnType<typeof getGciHistory>>
  );

  const frozen = batch.filter((m) => by[m] && !by[m].unreachable?.length);
  const missed = batch.filter((m) => !frozen.includes(m));

  /* The funnel archive covers a shorter span (REX's viewing types only exist
     from Sep 2025), and getHistory sweeps its whole range itself — so it is
     called once here rather than per bite, and simply no-ops once warm. */
  let funnelMonths = 0;
  try {
    funnelMonths = Object.keys(await getHistory()).length;
  } catch {
    /* Funnels are a separate archive with a separate floor. Failing to warm
       them must not fail the money sweep that just succeeded. */
  }

  const remaining = outstanding.length - frozen.length;
  return NextResponse.json({
    ok: true,
    done: remaining <= 0,
    from,
    frozen,
    missed,
    remaining,
    /* Where to resume. Named explicitly so a caller loops on the response
       rather than recomputing the calendar and getting it subtly wrong. */
    nextFrom: remaining > 0 ? (outstanding.find((m) => !frozen.includes(m)) ?? null) : null,
    funnelMonths,
    tookMs: Date.now() - started,
  });
}
