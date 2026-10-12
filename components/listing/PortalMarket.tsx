"use client";

import { useEffect, useMemo, useState } from "react";
import type { PortalStat } from "@/lib/rex-portal-stats";
import type { HistoryPoint, Market } from "@/lib/portal-market";

/**
 * How the advert is doing, against the market (James, 12 Oct 2026: "break
 * these down into charts based on what the average property is doing on the
 * market at the moment ... it's not just two flat views").
 *
 * The figures are read live from the portals for this home and kept daily
 * for every live home (lib/portal-market). Everything is per day live, so a
 * home up a week and one up three months compare fairly. One home is the
 * point, so it is drawn in the accent and every other home in grey.
 */

type Answer = {
  ok: boolean;
  error?: string;
  portals?: PortalStat[];
  totals?: { detail: number | null; summary: number | null; ctr: number | null };
  empty?: boolean;
  market?: Market | null;
  history?: HistoryPoint[];
};

const ME = "var(--accent-dark)";
const THEM = "color-mix(in srgb, var(--muted) 42%, var(--page))";
const num = (n: number | null | undefined, dp = 0) => (n == null ? "—" : n.toLocaleString("en-GB", { maximumFractionDigits: dp, minimumFractionDigits: 0 }));
const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const todayLondon = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });

/** "+34% on the average", "12% under the average". */
function versus(me: number | null | undefined, avg: number | null | undefined) {
  if (me == null || !avg) return null;
  const d = Math.round(((me - avg) / avg) * 100);
  if (Math.abs(d) < 3) return { text: "In line with the average", good: null as boolean | null };
  return d > 0 ? { text: `${d}% above the average`, good: true } : { text: `${Math.abs(d)}% below the average`, good: false };
}

function Tile({ label, value, unit, sub, good }: { label: string; value: string; unit?: string; sub: string | null; good?: boolean | null }) {
  return (
    <div className="min-w-0 rounded-xl border border-line/60 bg-white p-4">
      <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="figures mt-1.5 text-[26px] leading-none">
        {value}
        {unit && <span className="ml-1 text-[12px] text-muted">{unit}</span>}
      </p>
      {sub && (
        <p className={`mt-2 text-[11.5px] leading-snug ${good === true ? "text-[#56634a]" : good === false ? "text-accent-dark" : "text-muted"}`}>
          {good === true ? "▲ " : good === false ? "▼ " : ""}
          {sub}
        </p>
      )}
    </div>
  );
}

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-xl border border-line/60 bg-white p-4 sm:p-5">
      <h3 className="text-[13.5px] font-semibold">{title}</h3>
      {sub && <p className="mt-0.5 text-[11.5px] text-muted">{sub}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Two series, named: this home and the market. */
function Legend({ market = "Average live home" }: { market?: string }) {
  return (
    <p className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: ME }} />This home</span>
      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: THEM }} />{market}</span>
    </p>
  );
}

/**
 * Every live home's views a day as a dot, this one in the accent, the
 * average and the median marked. Dots that would land on each other stack
 * upwards, so a crowd reads as a crowd.
 */
function Strip({ market, listingId }: { market: Market; listingId: string }) {
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  /* Drawn near its real size, so the words stay readable. */
  const W = 460;
  const H = 190;
  const pad = { l: 12, r: 12, b: 26 };
  const max = Math.max(1, ...market.spread.map((h) => h.viewsPerDay)) * 1.05;
  const x = (v: number) => pad.l + (v / max) * (W - pad.l - pad.r);
  const R = 5;
  /* Stack dots that collide, bottom up. */
  const placed: { id: string; name: string; v: number; cx: number; cy: number }[] = [];
  for (const h of [...market.spread].sort((a, b) => a.viewsPerDay - b.viewsPerDay)) {
    const cx = x(h.viewsPerDay);
    let level = 0;
    while (placed.some((p) => Math.abs(p.cx - cx) < R * 2 + 1 && Math.abs(p.cy - (H - pad.b - R - level * (R * 2 + 1))) < 1)) level += 1;
    placed.push({ id: h.id, name: h.name, v: h.viewsPerDay, cx, cy: H - pad.b - R - Math.min(level, 11) * (R * 2 + 1) });
  }
  const me = placed.find((p) => p.id === listingId) ?? null;
  const ticks = [0, max / 4, max / 2, (3 * max) / 4].map((t) => Math.round(t));
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`Views a day for ${market.homes} live homes; this home ${me ? me.v : "not live"}, average ${market.average.viewsPerDay}`}>
        <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="var(--line)" strokeWidth="1" />
        {ticks.map((t) => (
          <text key={t} x={x(t)} y={H - pad.b + 16} textAnchor="middle" fontSize="11" fill="var(--muted)">{t}</text>
        ))}
        {/* The average and the median. */}
        {[
          { v: market.average.viewsPerDay, label: `Average ${market.average.viewsPerDay}` },
          { v: market.median.viewsPerDay, label: `Median ${market.median.viewsPerDay}` },
        ].map((m, i) => (
          <g key={m.label}>
            <line x1={x(m.v)} x2={x(m.v)} y1={i ? 26 : 12} y2={H - pad.b} stroke="var(--muted)" strokeWidth="1" strokeDasharray="3 3" opacity="0.7" />
            <text x={x(m.v) + (i ? -4 : 4)} y={i ? 24 : 10} textAnchor={i ? "end" : "start"} fontSize="11" fill="var(--muted)">{m.label}</text>
          </g>
        ))}
        {placed.map((p) => (
          <circle
            key={p.id}
            cx={p.cx}
            cy={p.cy}
            r={p.id === listingId ? R + 2 : R}
            fill={p.id === listingId ? ME : THEM}
            stroke="var(--card)"
            strokeWidth="2"
            onMouseEnter={() => setTip({ x: (p.cx / W) * 100, y: (p.cy / H) * 100, text: `${p.name}: ${p.v} views a day` })}
            onMouseLeave={() => setTip(null)}
          />
        ))}
        {me && (
          <g>
            <line x1={me.cx} x2={me.cx} y1={44} y2={me.cy - R - 3} stroke={ME} strokeWidth="1.5" />
            <text x={Math.min(Math.max(me.cx, 50), W - 50)} y={40} textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--ink)">This home · {me.v}</text>
          </g>
        )}
      </svg>
      {tip && (
        <span className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-[11px] text-white shadow" style={{ left: `${tip.x}%`, top: `calc(${tip.y}% - 8px)` }}>
          {tip.text}
        </span>
      )}
      <p className="mt-1 text-center text-[10.5px] text-muted">Views a day since going live · {market.homes} live homes</p>
    </div>
  );
}

/** Horizontal bars: rows of this home against the market, labelled at the ends. */
function PairBars({ rows, unit }: { rows: { label: string; me: number | null; them: number | null; note?: string }[]; unit: string }) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.me ?? 0, r.them ?? 0]));
  const bar = (v: number | null, color: string, who: string, label: string) => (
    <div className="flex items-center gap-2" title={`${label} · ${who}: ${v == null ? "no figures" : `${num(v, 1)} ${unit}`}`}>
      <div className="h-3 min-w-0 flex-1 rounded-r-[4px] bg-transparent">
        <div className="h-3 rounded-r-[4px]" style={{ width: `${v == null ? 0 : Math.max(2, (v / max) * 100)}%`, background: color }} />
      </div>
      <span className="figures w-14 shrink-0 text-right text-[11.5px] text-ink">{v == null ? "—" : num(v, 1)}</span>
    </div>
  );
  return (
    <ul className="space-y-3.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-3">
          <span className="min-w-0">
            <span className="block truncate text-[12px] font-semibold">{r.label}</span>
            {r.note && <span className="block truncate text-[10.5px] text-muted">{r.note}</span>}
          </span>
          <span className="space-y-1">
            {bar(r.me, ME, "This home", r.label)}
            {bar(r.them, THEM, "Average", r.label)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** This home's views, day by day as they have been kept. */
function Trend({ history }: { history: HistoryPoint[] }) {
  const pts = history.filter((h) => h.detail != null);
  const [hover, setHover] = useState<number | null>(null);
  if (pts.length < 2) {
    return (
      <p className="rounded-xl border border-dashed border-line/80 px-4 py-6 text-center text-[12px] leading-relaxed text-muted">
        The figures are kept from {pts[0] ? day(pts[0].on) : "today"}. The line builds day by day from here.
      </p>
    );
  }
  const W = 640;
  const H = 170;
  const pad = { l: 40, r: 12, t: 12, b: 26 };
  const ys = pts.map((p) => p.detail as number);
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const span = Math.max(1, hi - lo);
  const x = (i: number) => pad.l + (i / (pts.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - lo) / span) * (H - pad.t - pad.b);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.detail as number).toFixed(1)}`).join(" ");
  const h = hover != null ? pts[hover] : null;
  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full"
        role="img"
        aria-label={`Views to date, from ${num(lo)} on ${day(pts[0].on)} to ${num(hi)} on ${day(pts[pts.length - 1].on)}`}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (pts.length - 1));
          setHover(Math.max(0, Math.min(pts.length - 1, i)));
        }}
        onMouseLeave={() => setHover(null)}
      >
        {[lo, lo + span / 2, hi].map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth="1" opacity="0.5" />
            <text x={pad.l - 6} y={y(v) + 3} textAnchor="end" fontSize="10" fill="var(--muted)">{num(Math.round(v))}</text>
          </g>
        ))}
        <path d={d} fill="none" stroke={ME} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <text x={pad.l} y={H - 6} fontSize="10" fill="var(--muted)">{day(pts[0].on)}</text>
        <text x={W - pad.r} y={H - 6} textAnchor="end" fontSize="10" fill="var(--muted)">{day(pts[pts.length - 1].on)}</text>
        {h && hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="var(--muted)" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx={x(hover)} cy={y(h.detail as number)} r="4.5" fill={ME} stroke="var(--card)" strokeWidth="2" />
          </g>
        )}
      </svg>
      {h && hover != null && (
        <span className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-[11px] text-white shadow" style={{ left: `${(x(hover) / W) * 100}%` }}>
          {day(h.on)}: {num(h.detail)} views, {num(h.summary)} appearances
        </span>
      )}
    </div>
  );
}

export default function PortalMarket({ listingId }: { listingId: string }) {
  const [a, setA] = useState<Answer | null>(null);
  useEffect(() => {
    let live = true;
    setA(null);
    fetch(`/api/listings/stats?id=${encodeURIComponent(listingId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: Answer) => live && setA(j))
      .catch(() => live && setA({ ok: false, error: "The portal figures did not load. Try again in a minute." }));
    return () => {
      live = false;
    };
  }, [listingId]);

  /* While today's read of the market is still going, ask again a few times. */
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (!a?.ok || tries >= 6) return;
    if (a.market?.asOf === todayLondon() && (a.market?.homes ?? 0) > 5) return;
    const t = setTimeout(() => {
      fetch(`/api/listings/stats?id=${encodeURIComponent(listingId)}&only=market`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j: { ok?: boolean; market?: Market | null; history?: HistoryPoint[] }) => {
          if (j.ok) setA((cur) => (cur ? { ...cur, market: j.market ?? cur.market, history: j.history ?? cur.history } : cur));
        })
        .catch(() => undefined)
        .finally(() => setTries((n) => n + 1));
    }, 12000);
    return () => clearTimeout(t);
  }, [a, tries, listingId]);

  const m = a?.market ?? null;
  const portalRows = useMemo(
    () => (m?.portals ?? []).filter((p) => p.viewsPerDay != null || p.marketViewsPerDay != null).map((p) => ({ label: p.portal, me: p.viewsPerDay, them: p.marketViewsPerDay, note: `${p.homes} homes` })),
    [m]
  );

  if (!a) {
    return (
      <p className="flex items-center gap-2 py-6 text-[12.5px] text-muted">
        <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-accent-dark" />
        Reading the portals…
      </p>
    );
  }
  if (!a.ok) return <p className="py-4 text-[12.5px] text-accent-dark">{a.error ?? "The portal figures did not load."}</p>;
  if (a.empty) return <p className="py-4 text-[12.5px] text-muted">The portals have nothing recorded for this home yet. Figures usually show the day after it goes live.</p>;

  const vs = versus(m?.me?.viewsPerDay, m?.average.viewsPerDay);
  const vsApp = versus(m?.me?.appearancesPerDay, m?.average.appearancesPerDay);
  const vsCtr = versus(m?.me?.ctr, m?.average.ctr);
  const reading = !m || m.asOf !== todayLondon();

  return (
    <div className="space-y-4">
      {reading && tries < 6 && (
        <p className="flex items-center gap-2 text-[11.5px] text-muted">
          <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
          Reading today&apos;s figures for every live home to compare against…
        </p>
      )}

      {/* The four numbers, each against the average live home. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Views a day" value={num(m?.me?.viewsPerDay ?? null, 1)} sub={vs?.text ?? (m ? `Average ${num(m.average.viewsPerDay, 1)}` : null)} good={vs?.good} />
        <Tile label="Appearances a day" value={num(m?.me?.appearancesPerDay ?? null, 0)} sub={vsApp?.text ?? null} good={vsApp?.good} />
        <Tile label="Clicked through" value={num(m?.me?.ctr ?? a.totals?.ctr ?? null, 1)} unit="%" sub={vsCtr?.text ?? null} good={vsCtr?.good} />
        <Tile
          label="Rank by views a day"
          value={m?.rank ? `${m.rank}` : "—"}
          unit={m?.rank ? `of ${m.homes}` : undefined}
          sub={
            m?.me && m.rank
              ? `${m.rank <= Math.ceil(m.homes / 4) ? "Top quarter" : m.rank > Math.floor((m.homes * 3) / 4) ? "Bottom quarter" : "Middle half"} · ${m.me.daysLive} ${m.me.daysLive === 1 ? "day" : "days"} live`
              : m ? "Not ranked: no figures today" : null
          }
          good={m?.rank && m.homes ? (m.rank <= Math.ceil(m.homes / 4) ? true : m.rank > Math.floor((m.homes * 3) / 4) ? false : null) : null}
        />
      </div>

      {m && m.homes > 1 ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card title="Against every live home" sub="Each dot is a home on the portals now. Hover one to see which.">
            <Strip market={m} listingId={listingId} />
          </Card>
          <Card title="By portal" sub="Views a day: this home and the average live home on each portal.">
            <Legend />
            {portalRows.length ? <PairBars rows={portalRows} unit="views a day" /> : <p className="text-[12px] text-muted">No portal figures yet.</p>}
          </Card>
          <Card title="Clicked through" sub="Of the times it appeared in a search, how often somebody opened it. The photos, the headline and the price working together.">
            <Legend market="Average" />
            <PairBars
              unit="%"
              rows={[
                { label: "All live homes", me: m.me?.ctr ?? null, them: m.average.ctr, note: `${m.homes} homes` },
                ...(m.similarRent ? [{ label: "Similar rent", me: m.me?.ctr ?? null, them: m.similarRent.ctr, note: `${m.similarRent.homes} homes within 20%` }] : []),
              ]}
            />
          </Card>
          <Card title="Views to date" sub="This home's total, as kept each day.">
            <Trend history={a.history ?? []} />
          </Card>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-line/80 px-4 py-4 text-[12px] text-muted">
          The comparison builds as the figures for every live home are read. Look again in a minute.
        </p>
      )}

      {/* The figures themselves, as the portals give them. */}
      <section className="rounded-xl border border-line/60 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-[13.5px] font-semibold">The figures</h3>
          <p className="text-[11.5px] text-muted">
            {num(a.totals?.detail)} views from {num(a.totals?.summary)} appearances · campaign to date
          </p>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-[12px]">
            <thead className="text-[10.5px] uppercase tracking-wide text-muted">
              <tr>
                <th className="pb-2 font-semibold">Portal</th>
                <th className="pb-2 text-right font-semibold">Views</th>
                <th className="pb-2 text-right font-semibold">Appearances</th>
                <th className="pb-2 text-right font-semibold">Clicked</th>
                <th className="pb-2 text-right font-semibold">On a phone</th>
                <th className="pb-2 text-right font-semibold">Up to</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/50">
              {(a.portals ?? []).map((p) => (
                <tr key={p.id}>
                  <td className="py-2">
                    <span className="font-semibold">{p.portal}</span>
                    {p.branch && <span className="block text-[10.5px] text-muted">{p.branch}</span>}
                  </td>
                  <td className="figures py-2 text-right">{num(p.detail.total)}</td>
                  <td className="figures py-2 text-right">{num(p.summary.total)}</td>
                  <td className="figures py-2 text-right">{p.ctr == null ? "—" : `${p.ctr}%`}</td>
                  <td className="figures py-2 text-right">{p.detail.total && p.detail.mobile != null ? `${Math.round((p.detail.mobile / p.detail.total) * 100)}%` : "—"}</td>
                  <td className={`py-2 text-right ${p.isStale ? "text-accent-dark" : "text-muted"}`}>{p.lastUpdated ? day(p.lastUpdated) : "—"}{p.isStale ? " · late" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
