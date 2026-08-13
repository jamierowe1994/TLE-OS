"use client";

import { useEffect, useState } from "react";
import type { PortalStats } from "@/lib/rex-portal-stats";

/**
 * How the advert is actually doing.
 *
 * Two numbers per portal, and they answer different questions — which is the
 * whole reason both are here. APPEARANCES is reach: how often it came up in
 * somebody's search, mostly a function of price and ranking. VIEWS is how
 * often that turned into a click, which is the photos, the headline and the
 * price working together.
 *
 * So a listing with reach and no clicks has a presentation problem, and one
 * with neither has a price problem. A single "views" figure — which is what
 * every portal's own dashboard shows you — cannot tell those two apart, and
 * they need completely different fixes.
 *
 * Read-only through the office account. Nobody should have to log in to look
 * at a view count.
 */

const nf = (n: number | null) => (n == null ? "—" : n.toLocaleString("en-GB"));

export default function PortalStatsPanel({ listingId }: { listingId: string }) {
  const [data, setData] = useState<PortalStats | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "off">("loading");

  useEffect(() => {
    let live = true;
    setState("loading");
    fetch(`/api/listings/stats?id=${encodeURIComponent(listingId)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!live) return;
        if (j.ok) {
          setData(j);
          setState("ready");
        } else setState("off");
      })
      .catch(() => live && setState("off"));
    return () => {
      live = false;
    };
  }, [listingId]);

  if (state === "off") return null;

  return (
    <div className="mt-3 rounded-3xl border border-line/80 bg-panel p-5">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-[14px]">How the advert is doing</h3>
        <span className="text-[10.5px] text-muted">
          Live from the portals, whole campaign to date
        </span>
        {data && !data.empty && data.totals.ctr != null && (
          <span className="ml-auto text-[11.5px] text-muted">
            {nf(data.totals.detail)} views from {nf(data.totals.summary)} appearances ·{" "}
            <span className="text-ink">{data.totals.ctr}%</span> clicked through
          </span>
        )}
      </div>

      {state === "loading" && (
        <p className="flex items-center gap-2.5 text-[12px] text-muted">
          <span className="block h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
          Asking the portals…
        </p>
      )}

      {state === "ready" && data?.empty && (
        <p className="text-[12px] leading-relaxed text-muted">
          Nothing recorded yet. Portal figures start a day or two after an advert goes live —
          if this one has been up longer than that, it may never have reached a portal.
        </p>
      )}

      {state === "ready" && !data?.empty && (
        <ul className="space-y-2">
          {data!.portals.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line/40 pb-2.5 last:border-0 last:pb-0"
            >
              <span className="min-w-[110px]">
                <span className="block text-[12.5px] font-semibold">{p.portal}</span>
                {p.branch && <span className="block text-[10.5px] text-muted">{p.branch}</span>}
              </span>

              <span className="min-w-[86px]">
                <span className="figures block text-[17px] leading-none">{nf(p.detail.total)}</span>
                <span className="mt-0.5 block text-[10.5px] text-muted">views</span>
              </span>

              <span className="min-w-[96px]">
                <span className="figures block text-[17px] leading-none text-muted">
                  {nf(p.summary.total)}
                </span>
                <span className="mt-0.5 block text-[10.5px] text-muted">appearances</span>
              </span>

              <span className="min-w-[64px]">
                <span className="figures block text-[17px] leading-none text-accent-dark">
                  {p.ctr == null ? "—" : `${p.ctr}%`}
                </span>
                <span className="mt-0.5 block text-[10.5px] text-muted">clicked</span>
              </span>

              {/* Where the audience actually is. Worth seeing: it decides
                  whether the first photo has to work at thumbnail size. */}
              {p.detail.total != null && p.detail.mobile != null && p.detail.total > 0 && (
                <span className="min-w-[92px] text-[10.5px] text-muted">
                  {Math.round((p.detail.mobile / p.detail.total) * 100)}% on a phone
                </span>
              )}

              <span className="ml-auto text-[10.5px] text-muted">
                {p.isStale ? (
                  <span className="text-accent-dark">
                    Nothing since {p.lastUpdated} — {p.staleDays} days
                  </span>
                ) : p.lastUpdated ? (
                  `to ${p.lastUpdated}`
                ) : (
                  ""
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
