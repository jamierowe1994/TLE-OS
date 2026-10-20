"use client";

import { useEffect, useState } from "react";

/**
 * What the OS spends on Claude, feature by feature (20 Oct 2026).
 *
 * The account ran out of credit that afternoon and nobody could say which
 * feature had spent it. Every call is now written to os_ai_usage, and this
 * adds it up for the London month so far and the month before. The model
 * column is what each feature is on right now, including any AI_MODEL_
 * override set on Railway, so a switch shows here the moment it is made.
 */

type Feature = { id: string; label: string; model: string; effort: string; chosen: string; perMillion: { in: number; out: number } | null };
type Line = { feature: string; model: string; calls: number; refused: number; in: number; out: number; cacheRead: number; cacheWrite: number; cost: number | null };
type Answer = { ok: boolean; error?: string; features: Feature[]; month: Line[]; lastMonth: Line[]; since: string | null };

const MODEL_NAMES: Record<string, string> = {
  "claude-opus-5-5": "Opus 5.5",
  "claude-opus-5": "Opus 5",
  "claude-opus-4-8": "Opus 4.8",
  "claude-sonnet-5-5": "Sonnet 5.5",
  "claude-haiku-5-5": "Haiku 5.5",
  "claude-haiku-4-5": "Haiku 4.5",
};
const modelName = (id: string) => MODEL_NAMES[Object.keys(MODEL_NAMES).sort((a, b) => b.length - a.length).find((k) => id.startsWith(k)) ?? ""] ?? id;
const dollars = (n: number | null) => (n == null ? "-" : n < 0.01 && n > 0 ? "under 1c" : `$${n.toFixed(2)}`);
const tokens = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
const monthName = (offset: number) => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - offset);
  return d.toLocaleDateString("en-GB", { month: "long", timeZone: "Europe/London" });
};

function total(lines: Line[], feature?: string) {
  const mine = feature ? lines.filter((l) => l.feature === feature) : lines;
  return {
    calls: mine.reduce((s, l) => s + l.calls, 0),
    refused: mine.reduce((s, l) => s + l.refused, 0),
    in: mine.reduce((s, l) => s + l.in + l.cacheRead + l.cacheWrite, 0),
    out: mine.reduce((s, l) => s + l.out, 0),
    cost: mine.reduce((s, l) => s + (l.cost ?? 0), 0),
    unpriced: mine.some((l) => l.cost == null),
  };
}

export default function AiCosts() {
  const [data, setData] = useState<Answer | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/ai-usage", { cache: "no-store" });
        const body = (await res.json()) as Answer;
        if (!res.ok || !body.ok) throw new Error(body.error ?? "Couldn't read the usage.");
        setData(body);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);

  const rows = data
    ? data.features
        .map((f) => ({ f, now: total(data.month, f.id), last: total(data.lastMonth, f.id) }))
        .sort((a, b) => b.now.cost - a.now.cost || b.last.cost - a.last.cost)
    : [];
  const all = data ? total(data.month) : null;
  /* Nothing was measured before the first row. A month before that is
     "not recorded", never $0.00. */
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const lastMeasured = Boolean(data?.since && new Date(data.since) < monthStart);
  const allLast = data ? total(data.lastMonth) : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl tracking-normal text-ink">AI Costs</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Every call the OS makes to Claude, added up by feature for {monthName(0)} so far and for {monthName(1)}. The model
        column is what each feature uses right now. Costs are in US dollars, as Anthropic bills them.
      </p>

      {error && <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}

      {!data && !error && (
        <div className="mt-8 flex items-center gap-3 text-sm text-muted">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-ink" />
          Adding up this month
        </div>
      )}

      {data && all && allLast && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label={`${monthName(0)} so far`} value={dollars(all.cost)} />
            <Tile label={`All of ${monthName(1)}`} value={lastMeasured ? dollars(allLast.cost) : "Not recorded"} />
            <Tile label={`Calls in ${monthName(0)}`} value={all.calls.toLocaleString("en-GB")} />
            <Tile label="Declined by the model" value={all.refused.toLocaleString("en-GB")} />
          </div>
          {data.since && (
            <p className="mt-3 text-xs text-muted">
              Recording since {new Date(data.since).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" })}.
              Anything earlier was not measured.
            </p>
          )}
          {!data.since && <p className="mt-3 text-xs text-muted">Nothing recorded yet. The first call to Claude will appear here.</p>}

          <div className="mt-6 overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-box text-xs text-muted">
                <tr>
                  <th className="px-3 py-2 font-normal">Feature</th>
                  <th className="px-3 py-2 font-normal">Model now</th>
                  <th className="px-3 py-2 text-right font-normal">Calls</th>
                  <th className="px-3 py-2 text-right font-normal">Tokens in / out</th>
                  <th className="px-3 py-2 text-right font-normal">{monthName(0)}</th>
                  <th className="px-3 py-2 text-right font-normal">{monthName(1)}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ f, now, last }) => (
                  <tr key={f.id} className="border-t border-line">
                    <td className="px-3 py-2 text-ink">{f.label}</td>
                    <td className="px-3 py-2">
                      <span className="text-ink">{modelName(f.model)}</span>
                      <span className="text-muted">, {f.effort} effort</span>
                      {f.model !== f.chosen && <span className="ml-1 text-xs text-amber-700">(switched on Railway)</span>}
                    </td>
                    <td className="figures px-3 py-2 text-right">{now.calls ? now.calls.toLocaleString("en-GB") : "-"}</td>
                    <td className="figures px-3 py-2 text-right text-muted">{now.calls ? `${tokens(now.in)} / ${tokens(now.out)}` : "-"}</td>
                    <td className="figures px-3 py-2 text-right text-ink">{now.calls ? dollars(now.cost) : "-"}</td>
                    <td className="figures px-3 py-2 text-right text-muted">{last.calls ? dollars(last.cost) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted">
            To move a feature to another model without a deploy, set AI_MODEL_ and its name on the TLE-OS service in Railway,
            for example AI_MODEL_PLC_SCAN=claude-opus-5-5. docs/AI-MODELS.md has which model each feature is on and why.
          </p>
        </>
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line p-3">
      <span className="figures block text-2xl text-ink">{value}</span>
      <span className="mt-1 block text-xs text-muted">{label}</span>
    </div>
  );
}
