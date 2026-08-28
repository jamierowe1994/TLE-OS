import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { getAgentEarningsForMonths } from "@/lib/business/payprop-income";
import { getAgentBook, normaliseAgentName } from "@/lib/business/payprop-portfolio";
import { getPropolyAgentDeals } from "@/lib/business/propoly-deals";
import { getComplianceAsAt } from "@/lib/business/rex-stats";
import { LIVE_START } from "@/lib/business/roster";

/**
 * ONE partner, live — the four sources the drill-down used to read from July.
 *
 * GET /api/business/agent-live?agent=Rhiannon+Dodge&email=…&month=YYYY-MM
 *   → { months, earnings[], book, deals, compliance }
 *
 * ── Why this route had to exist ───────────────────────────────────────────
 *
 * Susan's partner drill-down was reading six hardcoded tables of 11 July
 * records — net income, portfolio, compliance, move-ins and two pipelines —
 * while the tabs BEHIND it had all been wired live months ago. Open Rhiannon
 * from the live table and every figure silently reverted to July, including
 * property addresses and rents.
 *
 * The live per-partner functions already existed. `getAgentEarningsForMonths`,
 * `getAgentBook` and `getPropolyAgentDeals` were written, commented, correct
 * and called by absolutely nobody. This route is mostly an introduction.
 *
 * ── Why the earnings series starts at LIVE_START and not January ──────────
 *
 * It cannot start earlier and be true. The portal reports its own measured
 * figures from Aug 2026; before that there is Susan's hand-keyed sheet and
 * nothing else, and the two are not the same measurement — one is typed, one
 * is walked out of PayProp. Drawing them on one line describes the change of
 * method, not the business. So the series begins where the measuring begins
 * and the drill-down says "since August 2026" out loud.
 *
 * ── Null is not zero, anywhere in here ────────────────────────────────────
 *
 * Every source returns null when it could not be reached, and every null is
 * passed through as null rather than collapsed to 0. A partner who earned
 * nothing and a partner PayProp could not answer for look identical at 0 and
 * must never look identical on screen. `matched: false` is the third case
 * again — PayProp holds no beneficiary under that partner at all.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** LIVE_START … month inclusive. Empty if the month predates measuring. */
function monthsUpTo(month: string): string[] {
  const out: string[] = [];
  let [y, m] = LIVE_START.split("-").map(Number);
  for (let guard = 0; guard < 60; guard++) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    if (key > month) break;
    out.push(key);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

export async function GET(req: NextRequest) {
  if (!(await requireCapability(req, "see:business"))) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const agent = (req.nextUrl.searchParams.get("agent") ?? "").trim();
  if (!agent) {
    return NextResponse.json({ error: "agent required" }, { status: 400 });
  }
  const email = (req.nextUrl.searchParams.get("email") ?? "").trim();
  const agentKey = req.nextUrl.searchParams.get("agentKey");
  const param = req.nextUrl.searchParams.get("month");
  const month =
    param && MONTH_RE.test(param) ? param : new Date().toISOString().slice(0, 7);

  const months = monthsUpTo(month);

  /* Four independent sources, so one slow or broken one must not take the
     other three down with it. PayProp's walk is the slow one; REX compliance
     can take ~2 minutes cold. allSettled, then null per source. */
  const [earningsR, bookR, dealsR, complianceR] = await Promise.allSettled([
    /* Without an email there is no beneficiary to look up. Name matching is
       the looser key and getAgentEarningsForMonths already falls back to it,
       but it needs SOMETHING — so skip rather than ask PayProp about "". */
    email ? getAgentEarningsForMonths(email, months, agent) : Promise.resolve(null),
    getAgentBook(agent),
    email ? getPropolyAgentDeals({ email, agentKey: agentKey ?? null }) : Promise.resolve(null),
    getComplianceAsAt(month),
  ]);

  const val = <T,>(r: PromiseSettledResult<T>): T | null =>
    r.status === "fulfilled" ? r.value : null;

  const compliance = val(complianceR);
  const key = normaliseAgentName(agent);

  return NextResponse.json({
    /* Echoed so the drill-down can discard an answer for a partner or month
       the user has already navigated away from. */
    agent,
    month,
    months,
    liveStart: LIVE_START,
    earnings: val(earningsR),
    book: val(bookR),
    deals: val(dealsR),
    compliance:
      compliance?.byAgent?.find((r) => normaliseAgentName(r.label) === key) ?? null,
  });
}
