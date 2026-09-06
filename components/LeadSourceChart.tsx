"use client";

import { useState } from "react";
import type { Lead } from "@/lib/leads-sample";

/**
 * Where the leads actually came from — the one question on this page that
 * nothing else answers.
 *
 * It replaces the Latest-leads list, which was the most duplicated box on the
 * dashboard: the count sits in the stat tile directly above it and the names
 * are one click away in the nav. "Which channel is producing them" is the
 * marketing-spend decision, and it was nowhere.
 *
 * Drawn as columns rather than a pie. A hand-wobbled pie read as sloppy rather
 * than crafted, and four shares are easier to compare as heights than as
 * angles — nobody can eyeball 17% against 25% on a disc.
 *
 * The dashed rule inside each column is LAST MONTH. That is what makes this a
 * chart rather than a decoration: the bar alone says Portals is biggest, which
 * everybody already knows. The bar against the rule says paid social is the
 * one that moved, and that is the sentence somebody acts on.
 *
 * Every colour is the picked accent, so clay, blush and red all work and dark
 * mode needs no special case.
 */

type Group = { key: string; sources: string[] };

/* Which REX sources land in which column. REX names a source off the email it
   came from (lib/rex-leads sourceOf), so the words here are those. Anything
   unlisted falls into "Other" rather than vanishing from the total. */
const GROUPS: Group[] = [
  { key: "Portals", sources: ["Rightmove", "Zoopla", "OnTheMarket", "GetAgent", "SpareRoom", "Gumtree", "Openrent"] },
  { key: "Paid social", sources: ["Facebook", "Instagram", "Facebook ad", "Instagram ad", "TikTok ad", "Google Ads", "Ghl", "Gohighlevel"] },
  { key: "Website", sources: ["Website", "Direct", "Phone-in", "Walk-in", "Email enquiry", "Live chat"] },
  { key: "Word of mouth", sources: ["Referral", "Existing landlord", "Existing tenant", "Event", "Board / signage"] },
  { key: "Other", sources: [] },
];

/**
 * Percentages that sum to exactly 100.
 *
 * Rounding each share independently gives 99 or 101 often enough that somebody
 * would eventually notice and stop trusting the box. Largest remainder fixes
 * it: floor everything, then hand the leftover points to whoever lost most.
 */
function wholePercents(counts: number[]): number[] {
  const total = counts.reduce((a, b) => a + b, 0);
  if (!total) return counts.map(() => 0);
  const exact = counts.map((c) => (c / total) * 100);
  const out = exact.map(Math.floor);
  let left = 100 - out.reduce((a, b) => a + b, 0);
  const order = exact
    .map((e, i) => ({ i, rem: e - Math.floor(e) }))
    .sort((a, b) => b.rem - a.rem);
  for (let k = 0; left > 0; k++, left--) out[order[k % order.length].i]++;
  return out;
}

/** The empty part of a column: fine diagonals, so it reads as "not filled". */
const HATCH =
  "repeating-linear-gradient(45deg, transparent 0 5px, color-mix(in srgb, var(--ink) 13%, transparent) 5px 6px)";

/**
 * Live since 6 Sep 2026. It counted the sample book before, so the dashboard
 * said "Portals 50%" on every laptop in the business regardless of what had
 * actually come in. The leads are the same 500 the Leads screen shows,
 * handed in by the tile; this month is counted from them, and last month
 * only if the scan reaches back to the first of it - otherwise the dashed
 * rule and the deltas are left off rather than drawn against a partial
 * month. Never a stand-in number.
 */
export default function LeadSourceChart({ leads }: { leads: Lead[] }) {
  const [hot, setHot] = useState<string | null>(null);

  const now = new Date();
  const thisStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
  const at = (l: Lead) => (l.receivedAt ? new Date(l.receivedAt).getTime() : NaN);
  const thisMonth = leads.filter((l) => at(l) >= thisStart);
  const lastMonth = leads.filter((l) => at(l) >= lastStart && at(l) < thisStart);
  const oldest = leads.reduce((a, l) => Math.min(a, Number.isFinite(at(l)) ? at(l) : Infinity), Infinity);
  const haveLast = oldest <= lastStart && lastMonth.length > 0;

  const groupOf = (l: Lead) => GROUPS.find((g) => g.sources.some((s) => s.toLowerCase() === (l.source ?? "").toLowerCase()))?.key ?? "Other";
  const countIn = (list: Lead[]) => GROUPS.map((g) => list.filter((l) => groupOf(l) === g.key).length);
  const counts = countIn(thisMonth);
  const total = counts.reduce((a, b) => a + b, 0);
  const pcts = wholePercents(counts);
  const prevPcts = haveLast ? wholePercents(countIn(lastMonth)) : GROUPS.map(() => 0);

  const bars = GROUPS.map((g, i) => ({
    key: g.key,
    count: counts[i],
    pct: pcts[i],
    prev: prevPcts[i],
    delta: haveLast ? pcts[i] - prevPcts[i] : 0,
  })).filter((b) => b.key !== "Other" || b.count > 0);

  // Scaled against the tallest thing on the chart, this month or last, so a
  // column can never overflow its track and the rules stay inside.
  const ceiling = Math.max(1, ...bars.flatMap((b) => [b.pct, b.prev]));
  const h = (v: number) => `${(v / ceiling) * 92}%`;

  /* Which column gets the full-strength accent.
     The biggest GAINER, ranked by relative growth rather than points — Portals
     moving 44→50 is a smaller story than paid social moving 19→25, even though
     both are six points. Not simply the biggest bar, because that is Portals
     every single month and saying so tells nobody anything. And not the
     biggest mover in either direction: the accent reads as approval, so it
     must never be the thing that fell. Nothing rising, nothing highlighted. */
  const risers = haveLast ? bars.filter((b) => b.delta > 0) : [];
  const mover = risers.length
    ? risers.reduce((a, b) => (b.delta / b.prev > a.delta / a.prev ? b : a))
    : null;
  const lead = bars.find((b) => b.key === (hot ?? mover?.key)) ?? null;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="figures text-[26px] leading-none">{total}</p>
        <p className="text-[10.5px] text-muted">leads this month</p>
      </div>

      <div className="mt-4 flex items-end gap-2">
        {bars.map((b) => {
          const lit = hot === b.key;
          const isMover = !hot && b.key === mover?.key;
          const strong = lit || isMover;
          return (
            <button
              key={b.key}
              type="button"
              onMouseEnter={() => setHot(b.key)}
              onMouseLeave={() => setHot(null)}
              className="group flex min-w-0 flex-1 flex-col items-stretch text-left"
            >
              <span
                className={`mb-1.5 block text-[10px] font-semibold tabular-nums transition-colors ${
                  strong ? "text-accent-dark" : "text-muted"
                }`}
              >
                {!haveLast ? "" : b.delta > 0 ? "+" : b.delta < 0 ? "−" : ""}
                {!haveLast ? "\u00a0" : Math.abs(b.delta) || "–"}
              </span>

              <span
                className="relative block h-[104px] w-full overflow-hidden rounded-lg"
                style={{ backgroundImage: HATCH }}
              >
                {/* Last month, as a rule you can see the bar against - only
                    when the book actually reaches back that far. */}
                {haveLast && (
                  <span
                    aria-hidden
                    className="absolute inset-x-0 border-t border-dashed border-ink/45"
                    style={{ bottom: h(b.prev) }}
                  />
                )}
                <span
                  className="absolute inset-x-0 bottom-0 rounded-lg transition-all duration-300"
                  style={{
                    height: h(b.pct),
                    backgroundColor: strong
                      ? "var(--accent)"
                      : "color-mix(in srgb, var(--accent) 32%, var(--page))",
                  }}
                />
              </span>

              <span className="mt-2 block truncate text-[10px] leading-tight text-muted">
                {b.key}
              </span>
              <span className="figures mt-0.5 block text-[13px] leading-none">{b.pct}%</span>
            </button>
          );
        })}
      </div>

      {/* One sentence under the chart, because a number nobody reads out loud
          is a number nobody acts on. */}
      <p className="mt-3.5 border-t border-line/60 pt-3 text-[11px] leading-relaxed text-muted">
        {!haveLast ? (
          <>
            {total} lead{total === 1 ? "" : "s"} so far this month · last month is not in the book yet
          </>
        ) : lead ? (
          <>
            <span className="font-semibold text-ink">{lead.key}</span>{" "}
            {lead.delta === 0
              ? "is level with last month"
              : `is ${Math.abs(lead.delta)} points ${lead.delta > 0 ? "up on" : "down on"} last month`}
            {" · "}
            {lead.count} lead{lead.count === 1 ? "" : "s"}
          </>
        ) : (
          "Nothing up on last month"
        )}
        {haveLast && <span className="ml-1 opacity-70">· dashed rule = last month</span>}
      </p>
    </div>
  );
}
