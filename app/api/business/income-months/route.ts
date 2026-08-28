import { NextResponse } from "next/server";
import { getGciHistory } from "@/lib/business/gci-history";
import { currentMonth, monthsThisYearToDate } from "@/lib/business/format";
import { hasDb, q } from "@/lib/business/db";

/**
 * The TLE Business Income table, month by month, live.
 *
 * WHY THIS EXISTS
 *
 * The table on the Income tab was a snapshot typed out of Susan's reports, and
 * its COLUMNS were typed too — jan…jun, q1, q2, ytd. So in August it still
 * ended at June, while the chart above it (which derives its window from the
 * calendar) already ran to July. One screen, two different ideas of how far
 * the year had got.
 *
 * The columns are now derived, and the months the snapshot never covered are
 * filled from PayProp instead of being left blank or hand-typed again.
 *
 * WHAT CAN AND CANNOT BE FILLED THIS WAY
 *
 * PayProp gives the GCI rows honestly — combined, per country, the agency's own
 * share, and what therefore went to associates. Those reconcile with Susan to
 * under 1%.
 *
 * It gives NOTHING for the licence fee rows: monthly licence, pro licence and
 * joining fees do not run through PayProp at all — joining fees go through a
 * separate bank account visible only in Barclays and QuickBooks. Those rows
 * stay null for any month the snapshot doesn't cover, and null renders as a
 * dash rather than a zero. A zero would say "we earned nothing", which is a
 * different and false statement.
 *
 * Nor does it give the fee BREAKDOWN (management / set-up / other) per country
 * — that split comes from Susan's own Summary of Fees. Also null.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** The metric labels, verbatim from the snapshot, so the two merge row for row. */
const GCI_ROWS = {
  eAndW: "E&W GCI (exc VAT)",
  glasgow: "Glasgow GCI (exc VAT)",
  combined: "Combined GCI (exc VAT)",
  associates: "Paid to Associates (E&W)",
  tleNet: "Combined Net Income to TLE",
} as const;

/**
 * SELF-WARMING — so nobody has to schedule anything.
 *
 * A cold month is minutes of PayProp paging. Somebody has to absorb that, and
 * the only question is who: Susan opening her figures at nine, or a background
 * job at first light that nobody is watching.
 *
 * Railway's cron runs a SERVICE on a schedule rather than pinging a URL, so
 * using it would mean deploying a second service whose entire job is to make
 * one HTTP call — a whole extra deployment, and one more thing to forget
 * exists. This does the same work with nothing to maintain.
 *
 * Once a day, at most: the first request after the marker goes stale kicks the
 * walk off IN THE BACKGROUND and returns immediately with whatever is already
 * cached. The person who triggers it waits for nothing; they simply see the
 * progress bar move while they read the rest of the page.
 *
 * The marker lives in os_cache, NOT in a module variable. Railway restarts
 * containers, and an in-memory flag would mean a fresh warm on every deploy
 * and every cold start — several of those in an afternoon is exactly the
 * hammering the daily limit exists to prevent.
 */
const WARM_KEY = "income:last-warm";
const WARM_EVERY_MS = 20 * 60 * 60 * 1000; // once a day, with room to drift

async function warmIfStale(months: string[]): Promise<void> {
  if (!hasDb() || !months.length) return;
  try {
    const rows = await q<{ computed_at: Date }>(
      "SELECT computed_at FROM os_cache WHERE key = $1",
      [WARM_KEY]
    );
    const last = rows[0]?.computed_at ? new Date(rows[0].computed_at).getTime() : 0;
    if (Date.now() - last < WARM_EVERY_MS) return;

    /* Claim it BEFORE starting. Two people opening the page in the same second
       would otherwise both see a stale marker and both start a walk. */
    await q(
      `INSERT INTO os_cache (key, payload, computed_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET computed_at = NOW()`,
      [WARM_KEY, JSON.stringify({ startedAt: new Date().toISOString() })]
    );

    // Deliberately not awaited — the caller gets their page now.
    void getGciHistory(months[0], months[months.length - 1], { wait: true }).catch(() => {});
  } catch {
    /* A warm that cannot start must never break the page it was warming. */
  }
}

export async function GET() {
  /* The LIVE month included. It was months-to-last-complete, which on the 28th
     of August ends at July — see the note on the business page about why a
     closed-report rule is wrong on a screen Susan runs the business from. */
  /* CLOSED months only. An earlier pass appended the current month, which put a
     part-month column in a row of complete ones — smaller, entirely plausible,
     and marked as walked-from-PayProp with nothing saying it was partial. That
     is the exact shape of the discrepancy this dashboard has been burned by.
     
     The in-progress month already has its own home: the estimate tiles at the
     top of the Income tab, which say "est" on their face. */
  const months = monthsThisYearToDate();
  if (!months.length) {
    // January. There is no complete month this year yet.
    return NextResponse.json({ months: [], rows: {}, filled: [] });
  }

  // Keyed by month, not a list — see lib/gci-history.
  void warmIfStale(months);

  const by = await getGciHistory(months[0], months[months.length - 1]).catch(
    () => ({}) as Awaited<ReturnType<typeof getGciHistory>>
  );

  const rows: Record<string, Record<string, number | null>> = {
    [GCI_ROWS.eAndW]: {},
    [GCI_ROWS.glasgow]: {},
    [GCI_ROWS.combined]: {},
    [GCI_ROWS.associates]: {},
    [GCI_ROWS.tleNet]: {},
  };

  /* WHAT IS ACTUALLY READY, reported rather than papered over.
     
     getGciHistory is non-blocking on a cold month: it starts the walk and
     returns nothing for that month. PayProp pages at 25 rows, so one cold
     month is ~1,400 rows ≈ 56 sequential requests — genuinely minutes. The
     screen used to fill the gap with a July snapshot and say "until they
     land", which meant a page that had loaded NOTHING looked identical to one
     that had loaded everything, and nobody could tell whether to wait. */
  const filled: string[] = [];
  for (const month of months) {
    const m = by[month];
    if (!m) continue;
    // A month PayProp couldn't fully answer is NOT reported as a figure. A
    // short month looks like a bad month, and nobody would know to doubt it.
    if (m.unreachable?.length) continue;

    const account = (match: RegExp) =>
      m.byAccount
        .filter((a) => match.test(a.label))
        .reduce((t, a) => t + a.combinedGci, 0) || null;

    const combined = Math.round(m.combinedGciNet);
    const tleNet = Math.round(m.agencyIncomeNet);

    rows[GCI_ROWS.eAndW][month] = account(/e&w|england|wales|edinburgh/i);
    rows[GCI_ROWS.glasgow][month] = account(/glasgow|scot/i);
    rows[GCI_ROWS.combined][month] = combined;
    rows[GCI_ROWS.tleNet][month] = tleNet;
    // What was left for the partners. Derived from the same two figures as the
    // headline, so it cannot drift from them.
    rows[GCI_ROWS.associates][month] = combined - tleNet;
    filled.push(month);
  }

  const pending = months.filter((m) => !filled.includes(m));
  return NextResponse.json({
    months,
    rows,
    filled,
    /* Named, so the screen can say "5 of 8 months ready, August still coming"
       instead of a spinner with no end in sight. */
    pending,
    warming: pending.length > 0,
    source: "PayProp, net of VAT",
  });
}
