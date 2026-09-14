import { NextRequest, NextResponse } from "next/server";
import { getGciHistory } from "@/lib/business/gci-history";
import { currentMonth, monthsThisYearToDate } from "@/lib/business/format";
import { requireCapability } from "@/lib/admin";

/**
 * Fetch the income months ahead of anybody asking.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 *
 * PayProp pages at 25 rows. One cold month is roughly 1,400 rows — about 56
 * sequential requests — so it takes minutes. Done on a page load that is
 * minutes of Susan watching a bar; done at 6am it is nobody watching anything.
 *
 * The point is not speed, it is WHO WAITS. James: "we might need to fetch a
 * couple of times a day, just so Susan can have up-to-date figures."
 *
 * ── Two ways in, deliberately ─────────────────────────────────────────────
 *
 * A signed-in owner can press it, and a cron can call it with the shared
 * secret. Cron cannot hold a session, and an endpoint that starts a
 * many-minute PayProp walk should not be open to anyone who finds the URL.
 *
 * ── `wait: true`, unlike the page load ────────────────────────────────────
 *
 * getGciHistory returns nothing at once for a cold month and computes behind
 * the scenes — right for a page, useless here: a warmer that returns
 * immediately has warmed nothing. This one waits, which is the whole job.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/* Longer than a default serverless slice — several cold months genuinely take
   this long, and being killed halfway means the next caller starts over. */
export const maxDuration = 800;

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  /* EITHER header name, and the second one is the point.
     Eighteen cron-callable routes in this app read "x-cron-key"; this one and
     business/income-months/warm were the only two reading "x-cron-secret", and
     every Railway cron service sends x-cron-key (see os-cron-daily's start
     command). So adding either of these to a cron the way every other route is
     added would have failed authorisation - and failed the way that gets
     believed, a job that runs on schedule, answers 401 and is watched by
     nobody. Both names are accepted; both are compared against CRON_SECRET the
     same constant-time way, so this is a second spelling, not a second key. */
  const offered = req.headers.get("x-cron-secret") ?? req.headers.get("x-cron-key");
  const byCron = Boolean(secret && offered && offered === secret);
  const byOwner = Boolean(await requireCapability(req, "see:business"));

  if (!byCron && !byOwner) {
    return NextResponse.json({ ok: false, error: "Not allowed." }, { status: 403 });
  }

  const months = monthsThisYearToDate();
  const live = currentMonth();
  if (!months.includes(live)) months.push(live);
  if (!months.length) return NextResponse.json({ ok: true, warmed: [], note: "No months yet." });

  const started = Date.now();
  const by = await getGciHistory(months[0], months[months.length - 1], { wait: true }).catch(
    () => ({}) as Awaited<ReturnType<typeof getGciHistory>>
  );

  const warmed = months.filter((m) => by[m] && !by[m].unreachable?.length);
  return NextResponse.json({
    ok: true,
    warmed,
    missed: months.filter((m) => !warmed.includes(m)),
    tookMs: Date.now() - started,
    by: byCron ? "cron" : "owner",
  });
}
