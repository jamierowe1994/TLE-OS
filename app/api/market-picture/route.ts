import { NextRequest, NextResponse } from "next/server";
import { getMarketPicture } from "@/lib/market-picture";
import { recentlyLet } from "@/lib/ma-research";

/**
 * GET /api/market-picture?postcode=NN5 4WJ
 *
 * The local lettings market for the Market step of a presentation. Read-only.
 *
 * ── WHY THIS IS NOT PART OF /api/ma-research ──────────────────────────────
 *
 * ma-research is what the builder loads on arrival, and it is already doing
 * an address match, nine area-statistics calls, a material-information pull,
 * the on-market feed and a REX book fetch. This adds a paged district fetch on
 * top, for a step the agent may never open — the Market tab is the fourth of
 * five. Folding it in would make every appraisal slower to answer the question
 * the FIRST tab asks.
 *
 * So it is its own route, fetched when the step is opened. See
 * lib/market-picture for where the figures come from and which
 * plausible-looking endpoint is deliberately not used.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/* The district fetch pages at 300 a time and REX is a second call on top.
   NN5 is one page; Birmingham and the London districts are not. */
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const postcode = (req.nextUrl.searchParams.get("postcode") ?? "").trim();
  if (!postcode) {
    return NextResponse.json({ error: "postcode is required" }, { status: 400 });
  }

  try {
    /* Our own let speed comes from the same REX query the Recently Let step
       uses, asked wider — a median over twelve rows is a coin toss, and this
       one is quoted beside the market's. Its failure is not fatal: the market
       picture is still worth drawing without our half of the comparison, and
       recentlyLet already swallows a REX outage to an empty list. */
    const [picture, ours] = await Promise.all([
      getMarketPicture(postcode, []),
      recentlyLet(postcode, 60).catch(() => []),
    ]);

    const letDays = ours
      .map((r) => r.daysToLet)
      .filter((d): d is number => typeof d === "number");

    /* FOUR IS THE FLOOR, the same one the rent medians use.

       Measured 31 Aug: PE1 has three completed lets with both timestamps and
       their median is 93 days. Three is a coin toss, and this particular
       median is the one figure on the slide that is ABOUT US — quoting "we let
       in 93 days" off three properties, beside a market figure drawn from 251,
       is the kind of number a landlord repeats back at the next appraisal.
       Below the floor we say we cannot measure it rather than guess. */
    const sorted = [...letDays].sort((a, b) => a - b);
    return NextResponse.json({
      ...picture,
      ourLetSpeed:
        sorted.length >= 4
          ? { median: sorted[Math.floor(sorted.length / 2)], n: sorted.length }
          : null,
    });
  } catch (e) {
    /* An error state, never a zero. A throttled Homesearch returning a
       confident "0 properties advertised in NN5" is the exact failure this
       codebase has shipped three times; hsLetBook throws for that reason and
       the panel renders the message. */
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
