"use client";

import { useEffect, useState } from "react";
import { Pill } from "@/components/Wire";
import type { MaResearch } from "@/lib/ma-research";

/**
 * The evidence behind a valuation, on one panel.
 *
 * Ordered by what changes a decision: the range first, then the properties it
 * rests on, then the area average as background. An agent standing in a
 * kitchen reads top-down and stops when they have enough.
 *
 * Every caveat the research produces is shown, not swallowed. A guide that
 * quietly drops "these are across the wider area" is worse than no guide,
 * because the agent quotes it as though it were local.
 */

const money = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;

const NEARNESS: Record<string, { label: string; tone: "accent" | "neutral" }> = {
  sector: { label: "same sector", tone: "accent" },
  district: { label: "same district", tone: "neutral" },
  area: { label: "wider area", tone: "neutral" },
};

export default function ResearchPanel({
  address,
  postcode,
  beds = 2,
}: {
  address: string;
  postcode: string;
  beds?: number;
}) {
  const [d, setD] = useState<MaResearch | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setD(null);
    setError(null);
    const q = new URLSearchParams({ address, postcode, beds: String(beds) });
    fetch(`/api/ma-research?${q}`)
      .then((r) => r.json())
      .then((j: MaResearch & { error?: string }) => {
        if (!live) return;
        if (j.error) setError(j.error);
        else setD(j);
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [address, postcode, beds]);

  if (error) {
    return (
      <div className="rounded-2xl border border-line/80 bg-panel p-5">
        <p className="text-[12.5px] text-muted">{error}</p>
      </div>
    );
  }
  if (!d) {
    return (
      <div className="rounded-2xl border border-line/80 bg-panel p-5">
        <p className="text-[12.5px] text-muted">Pulling comparables…</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line/80 bg-panel p-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">
          Best-price guide
        </p>
        <p className="text-[11px] text-muted">{d.sector ?? d.postcode}</p>
      </div>

      {/* The range, first and biggest — it is what the agent came for. */}
      {d.guide ? (
        <>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="figures text-[26px] leading-none">{money(d.guide.mid)}</span>
            <span className="text-[12.5px] text-muted">pcm</span>
          </div>
          <p className="mt-1 text-[12px] text-muted">
            Range {money(d.guide.low)}–{money(d.guide.high)} · {d.guide.basedOn} comparable
            {d.guide.basedOn === 1 ? "" : "s"}
          </p>
          {d.guide.caveat && (
            <p className="mt-2 rounded-xl border border-accent-dark/40 bg-accent-soft/40 p-2.5 text-[11.5px] leading-relaxed">
              {d.guide.caveat}
            </p>
          )}
        </>
      ) : (
        <p className="mt-3 text-[12.5px] text-muted">
          No comparables anywhere in our book for this postcode. The guide has to come from
          the agent, not from here.
        </p>
      )}

      {/* The address check. Loud when it fails — quoting a valuation for the
          wrong house in front of a landlord is unrecoverable. */}
      {d.addressWarning && (
        <p className="mt-3 rounded-xl border border-accent-dark/40 bg-accent-soft/40 p-2.5 text-[11.5px] leading-relaxed">
          {d.addressWarning}
        </p>
      )}

      {/* The properties it rests on — named, so they can be talked about. */}
      {d.comparables.length > 0 && (
        <div className="mt-4 border-t border-line/70 pt-4">
          <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">
            What it&apos;s based on
          </p>
          <ul className="mt-2.5 space-y-1.5">
            {d.comparables.map((c) => (
              <li key={c.id} className="flex items-baseline justify-between gap-3 text-[12.5px]">
                <span className="min-w-0 truncate">
                  {c.name}
                  <span className="ml-1.5 text-[10.5px] text-muted">{c.locality}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {c.daysOnMarket != null && (
                    <span className="text-[10.5px] text-muted">
                      {c.letAgreed ? `let in ${c.daysOnMarket}d` : `${c.daysOnMarket}d`}
                    </span>
                  )}
                  <Pill tone={NEARNESS[c.nearness]?.tone ?? "neutral"}>
                    {NEARNESS[c.nearness]?.label ?? c.nearness}
                  </Pill>
                  <span className="figures">{c.rentDisplay}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Background, last — it is the weakest evidence in the panel. */}
      <div className="mt-4 border-t border-line/70 pt-3 text-[11px] leading-relaxed text-muted">
        {d.areaAverage ? (
          <>
            Homesearch puts the average {d.areaAverage.beds}-bed asking rent in {d.sector} at{" "}
            <span className="figures">{money(d.areaAverage.avgRent)}</span> pcm.
          </>
        ) : (
          <>
            Homesearch has no average for this sector and bed count, so the guide rests on our
            own book alone.
          </>
        )}
      </div>
    </div>
  );
}
