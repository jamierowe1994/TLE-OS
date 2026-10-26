import ToolsHub from "@/components/new-look/tools/ToolsHub";

/**
 * Tools — the hub, and the front of the rail.
 *
 * ── Why this sits BEFORE Leads ────────────────────────────────────────────
 *
 * James, 29 Aug, on where prospecting belongs: "it can go before leads."
 *
 * That ordering is the argument for the screen existing at all. Everything
 * else in front of house starts with a lead that already arrived — Leads,
 * Market Appraisals, Listings, Viewings, Applications is one queue, read left
 * to right, and every stage of it assumes somebody put their hand up first.
 * The first group here is about the doors nobody has knocked on yet, so it
 * belongs at the head of that queue rather than beside it.
 *
 * ── A hub of tools, not a screen of records ───────────────────────────────
 *
 * Groups and tools come from lib/tools.ts, so adding one is a line of data. A
 * group with nothing in it does not render — an empty heading announces a
 * category we have not built and reads as something broken.
 *
 * The grid is a client component because entitlement is per person and has to
 * be fetched. Since the new look (26 Oct 2026) the header comes with it, as
 * which look a person gets is only known in the browser.
 */

export const metadata = { title: "Tools" };

export default function ToolsPage() {
  /* The old look or the new (lib/new-look "tools"), decided per person in the browser. */
  return <ToolsHub />;
}
