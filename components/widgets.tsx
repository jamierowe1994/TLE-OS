"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";
import DiaryCalendar from "@/components/DiaryCalendar";
import DiaryGrid from "@/components/DiaryGrid";
import LeadSourceChart from "@/components/LeadSourceChart";
import OutstandingTermsWidget from "@/components/OutstandingTerms";
import { FlowTag, Pill } from "@/components/Wire";
import { todaysAppts, DIARY as SAMPLE_DIARY, VIEWING_OUTCOMES } from "@/lib/diary";
import { useDiary } from "@/lib/diary-store";
import { dueWithin, CERT_META } from "@/lib/compliance";
import { LEADS, leadSide } from "@/lib/leads-sample";

/**
 * The widget registry — every box the dashboard can hold.
 *
 * THE RULE OF SIZE: a widget doesn't just get bigger, it gets DEEPER.
 *   1×1  — the number (a glance)
 *   2×1  — the number with its trend (a direction)
 *   1×2  — the list behind the number (the names)
 *   2×2+ — the full picture (the chart, the breakdown, the money)
 *
 * Every renderer receives (w, h) and decides its own depth, so resizing in
 * customise mode is the feature, not a layout accident.
 */

export type WidgetSize = { w: number; h: number };

export type WidgetDef = {
  label: string;
  icon: string;
  hint: string;
  defaultW: number;
  defaultH: number;
  /** The tap-to-size presets. Omitted = the global S 1×1 / M 2×1 / L 2×2. */
  sizes?: { s: [number, number]; m: [number, number]; l: [number, number] };
  render: (w: number, h: number) => React.ReactNode;
};

/* ── Shared bones ── */

export function Head({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <DoodleIcon name={icon} size={18} className="shrink-0 text-accent-dark" />
      <span className="truncate text-[10.5px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </span>
    </div>
  );
}

export function BigCount({ value, hint }: { value: string; hint: string }) {
  return (
    <>
      <p className="figures mt-3 text-[34px] leading-none">{value}</p>
      <p className="mt-1.5 truncate text-[11px] font-medium text-accent-dark">{hint}</p>
    </>
  );
}

/** Little bars, drawn flat — the trend at a glance. Deterministic data.
 *  Even gaps at a size the eye reads as deliberate (James, 8 Aug 2026). */
export function Bars({ data, tall = false }: { data: number[]; tall?: boolean }) {
  const max = Math.max(...data);
  return (
    <div className={`flex items-end gap-1.5 ${tall ? "h-16" : "h-9"}`}>
      {data.map((v, i) => (
        <div
          key={i}
          className={`flex-1 rounded-t-[4px] ${i === data.length - 1 ? "bg-accent-dark" : "bg-accent-soft"}`}
          style={{ height: `${Math.max(8, (v / max) * 100)}%` }}
          title={String(v)}
        />
      ))}
    </div>
  );
}

/** A donut, drawn from the tokens — shares as arc lengths on one ring. */
export function Donut({
  parts,
  size = 84,
  centre,
  sub,
}: {
  parts: { value: number; color: string }[];
  size?: number;
  centre: string;
  sub?: string;
}) {
  const total = parts.reduce((n, p) => n + p.value, 0) || 1;
  const r = 34;
  const C = 2 * Math.PI * r;
  let offset = 0;
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 84 84" className="h-full w-full -rotate-90">
        {parts.map((p, i) => {
          const len = (p.value / total) * C;
          const el = (
            <circle
              key={i}
              cx="42" cy="42" r={r}
              fill="none"
              stroke={p.color}
              strokeWidth="9"
              strokeDasharray={`${Math.max(0, len - 2)} ${C - len + 2}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="figures text-[15px] leading-none">{centre}</span>
        {sub && <span className="mt-0.5 text-[7.5px] font-semibold uppercase tracking-wide text-muted">{sub}</span>}
      </span>
    </span>
  );
}

/** A line graph: the trend as a stroke, the area softly filled beneath it,
 *  a dot on where we are now. */
export function LineGraph({ data, tall = false }: { data: number[]; tall?: boolean }) {
  const W = 200;
  const H = tall ? 64 : 40;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * (W - 8) + 4,
    H - 6 - ((v - min) / span) * (H - 14),
  ]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <span className="relative block w-full" style={{ height: H }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="none">
        <path
          d={`${line} L ${last[0]} ${H} L 4 ${H} Z`}
          fill="var(--accent-soft)"
          opacity="0.55"
        />
        <path d={line} fill="none" stroke="var(--accent-dark)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {/* The "now" dot lives OUTSIDE the stretched svg — a circle drawn
          inside preserveAspectRatio="none" is an oval, and James saw it. */}
      <span
        className="absolute h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-dark"
        style={{ left: `${(last[0] / W) * 100}%`, top: `${(last[1] / H) * 100}%` }}
      />
    </span>
  );
}

export function RowList({
  rows,
  max,
}: {
  rows: { a: string; b: string; c?: string }[];
  max: number;
}) {
  return (
    <ul className="mt-3 space-y-2 overflow-hidden">
      {rows.slice(0, max).map((r, i) => (
        <li key={i} className="flex items-baseline gap-2.5 text-[12px]">
          <span className="figures shrink-0 text-[11px] text-accent-dark">{r.a}</span>
          <span className="min-w-0 flex-1 truncate">{r.b}</span>
          {r.c && <span className="shrink-0 text-[10px] text-muted">{r.c}</span>}
        </li>
      ))}
    </ul>
  );
}

/* ── Sample series (no history store yet — these are the wireframe's truth) ── */
const LEADS_12W = [8, 11, 9, 14, 12, 10, 15, 13, 17, 12, 16, 14];
const LEADS_12M = [31, 28, 35, 42, 39, 45, 52, 48, 41, 44, 50, 47];
const FB_8W = [2, 4, 3, 5, 4, 6, 5, 9];
const IG_8W = [1, 1, 2, 3, 2, 2, 4, 4];
const VOIDS = [
  { name: "14 Portland Street", weeks: 6, rent: 795 },
  { name: "Flat 3, King Edward House", weeks: 3, rent: 650 },
  { name: "22 Ashfield Road", weeks: 2, rent: 725 },
  { name: "9 Granby Road", weeks: 1, rent: 995 },
];
const ADS = [
  { name: "2-bed launch — Didsbury", platform: "Facebook", leads: 6, spend: "£4.10/lead" },
  { name: "Landlord switch offer", platform: "Instagram", leads: 3, spend: "£7.40/lead" },
  { name: "Free valuation", platform: "Facebook", leads: 4, spend: "£5.20/lead" },
];

const tenantLeads = LEADS.filter((l) => leadSide(l) === "tenant");

/* ── The Diary widget: the day at 1×1, the week grid from 2×2, the full
   two-row diary at 4×3 — the same grid as everywhere else, so someone can
   log in, glance, and go. ── */
function DiaryWidget({ w, h }: { w: number; h: number }) {
  const [open, setOpen] = useState(false);
  const today = todaysAppts();
  if (w === 1 && h === 1) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="block w-full text-left">
        <Head icon="calendar" label="Diary" />
        <BigCount value={String(today.length)} hint={`today · next at ${today[0]?.start ?? "—"}`} />
        <DiaryCalendar open={open} onClose={() => setOpen(false)} />
      </button>
    );
  }
  if (w === 1) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="block w-full text-left">
        <Head icon="calendar" label="Diary — today" />
        <ul className="mt-4 space-y-2.5">
          {today.slice(0, h >= 3 ? 8 : 5).map((t) => (
            <li key={t.id} className="flex items-baseline gap-3">
              <span className="figures w-11 shrink-0 text-[13px] text-accent-dark">{t.start}</span>
              <span className="min-w-0">
                <span className="block truncate text-[12.5px]">{t.what}</span>
                <span className="block truncate text-[10.5px] text-muted">{t.who}</span>
              </span>
            </li>
          ))}
        </ul>
        <DiaryCalendar open={open} onClose={() => setOpen(false)} />
      </button>
    );
  }
  // Wide: the real week grid, scaled to the room it's given.
  const hourPx = h >= 3 ? 40 : 24;
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2">
        <Head icon="calendar" label="Diary — this week" />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-[10.5px] font-semibold text-muted transition-colors hover:text-ink"
        >
          Open full →
        </button>
      </div>
      <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-lg border border-line/50">
        <DiaryGrid week={0} hourPx={hourPx} onAppt={() => setOpen(true)} />
      </div>
      <DiaryCalendar open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

/* ── The Today widget carries its own calendar modal. ── */
function TodayWidget({ w, h }: { w: number; h: number }) {
  const [open, setOpen] = useState(false);
  const { appts } = useDiary();
  const today = appts.filter((a) => a.day === 0);
  const tomorrow = appts.filter((a) => a.day === 1);
  const showTomorrow = w >= 2 || h >= 3;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="block w-full text-left">
        <div className="flex items-center justify-between gap-2">
          <Head icon="calendar" label="Today" />
          {w >= 2 && <FlowTag from="365 calendar (sign-in TBC)" />}
        </div>
        {h === 1 ? (
          <BigCount value={String(today.length)} hint={`next at ${today[0]?.start ?? "—"}`} />
        ) : (
          <div className={showTomorrow && w >= 2 ? "mt-5 grid grid-cols-2 gap-4" : "mt-5"}>
            <ul className="space-y-2.5">
              {today.slice(0, 4).map((t) => (
                <li key={t.id} className="flex items-baseline gap-3">
                  <span className="figures w-11 shrink-0 text-[13px] text-accent-dark">{t.start}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px]">{t.what}</span>
                    <span className="block truncate text-[10.5px] text-muted">{t.who}</span>
                  </span>
                </li>
              ))}
            </ul>
            {showTomorrow && (
              <ul className="space-y-2.5">
                <li className="text-[10px] font-semibold uppercase tracking-wide text-muted">Tomorrow</li>
                {tomorrow.slice(0, 4).map((t) => (
                  <li key={t.id} className="flex items-baseline gap-3">
                    <span className="figures w-11 shrink-0 text-[13px] text-muted">{t.start}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-[12.5px]">{t.what}</span>
                      <span className="block truncate text-[10.5px] text-muted">{t.who}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {h >= 2 && (
          <span className="mt-3 block text-[11px] font-semibold text-muted">
            {today.length > 4 ? `+${today.length - 4} more today — open the full calendar →` : "Open the full calendar →"}
          </span>
        )}
      </button>
      <DiaryCalendar open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/* ── Attention list, with its ticks. ── */
function AttentionWidget({ h }: { w: number; h: number }) {
  const ITEMS = [
    { id: "leads", text: "3 leads uncontacted for over 24 hours", area: "Leads", hot: true },
    { id: "gas", text: "Gas cert expires in 12 days — 41 Harewood Road", area: "Compliance", hot: true },
    { id: "ref", text: "Referencing stalled 6 days — Flat 2, Mercer St", area: "Applications", hot: false },
    { id: "money", text: "£1,240 reconciled in, not yet paid out", area: "Finances", hot: false },
  ];
  const [done, setDone] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  if (h === 1) {
    return (
      <>
        <Head icon="bell" label="Needs attention" />
        <BigCount value={String(ITEMS.length - done.size)} hint="open items" />
      </>
    );
  }
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <Head icon="bell" label="Needs attention" />
        <Pill tone="accent">{ITEMS.length - done.size}</Pill>
      </div>
      <ul className="mt-5 space-y-2.5">
        {(showAll ? ITEMS : ITEMS.slice(0, 4)).map((a) => {
          const ticked = done.has(a.id);
          return (
            <li key={a.id}>
              <button
                type="button"
                onClick={() =>
                  setDone((cur) => {
                    const next = new Set(cur);
                    if (next.has(a.id)) next.delete(a.id);
                    else next.add(a.id);
                    return next;
                  })
                }
                className="flex w-full items-start gap-2.5 text-left"
              >
                <span
                  className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors ${
                    ticked ? "border-accent-dark bg-accent-soft text-accent-dark" : "border-line"
                  }`}
                >
                  {ticked && <span className="text-[10px] leading-none">✓</span>}
                </span>
                <span className={`text-[12.5px] leading-snug ${ticked ? "text-muted line-through opacity-60" : ""}`}>
                  {a.text}
                  <span className={`ml-1.5 text-[10px] font-semibold ${a.hot ? "text-accent-dark" : "text-muted"}`}>
                    {a.area}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {ITEMS.length > 4 && !showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-3 text-[11px] font-semibold text-muted transition-colors hover:text-ink"
        >
          Show all {ITEMS.length} →
        </button>
      )}
    </>
  );
}

/* ── The registry itself. ── */
/**
 * Industry news, from Landlord Today's feed.
 *
 * How many stories you get is the SIZE of the tile — one at 1x1, two at 2x1,
 * three when it's tall. That's the honest way to make a resizable widget
 * useful: not the same content shrunk, but more of it.
 *
 * One source for now. The API takes a source id already, so a second outlet
 * is an entry in a list rather than a rewrite.
 */
function NewsWidget({ w, h }: { w: number; h: number }) {
  const [items, setItems] = useState<{ title: string; link: string; at: string | null; blurb: string }[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/news")
      .then((r) => r.json())
      .then((j) => live && (j.ok ? setItems(j.items ?? []) : setFailed(true)))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  const count = w >= 2 && h >= 2 ? 3 : w >= 2 || h >= 2 ? 2 : 1;
  const ago = (iso: string | null) => {
    if (!iso) return "";
    const hrs = Math.floor((Date.now() - new Date(iso).valueOf()) / 3600000);
    if (hrs < 1) return "just now";
    if (hrs < 24) return `${hrs}h ago`;
    const d = Math.floor(hrs / 24);
    return `${d}d ago`;
  };

  return (
    <div className="flex h-full flex-col">
      <Head icon="megaphone" label="News" />
      {failed && <p className="mt-2 text-[11px] text-muted">The feed didn&apos;t answer.</p>}
      {!items && !failed && <p className="mt-2 text-[11px] text-muted">Reading the headlines…</p>}
      {items && !items.length && <p className="mt-2 text-[11px] text-muted">Nothing new today.</p>}
      {items && items.length > 0 && (
        <ul className="mt-1.5 min-h-0 flex-1 space-y-2">
          {items.slice(0, count).map((n) => (
            <li key={n.link} className="border-b border-line/40 pb-2 last:border-0 last:pb-0">
              <a
                href={n.link}
                target="_blank"
                rel="noreferrer"
                className="block transition-colors hover:text-accent-dark"
              >
                <span className="block text-[12px] font-semibold leading-snug">{n.title}</span>
                {/* The blurb only where there's room for it to be read rather
                    than clipped to three words. */}
                {count > 1 && n.blurb && (
                  <span className="mt-0.5 block truncate text-[10.5px] text-muted">{n.blurb}</span>
                )}
                <span className="mt-0.5 block text-[10px] text-muted">
                  Landlord Today · {ago(n.at)}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export const WIDGETS: Record<string, WidgetDef> = {
  "leads-today": {
    label: "Leads today", icon: "pack/target", hint: "count → trend → the names themselves",
    defaultW: 1, defaultH: 1,
    render: (w, h) => (
      <>
        <div className="flex items-center justify-between gap-2">
          <Head icon="pack/target" label="Leads today" />
          {w >= 2 && h >= 2 && <FlowTag from="REX + GHL" />}
        </div>
        {w === 1 && h === 1 && <BigCount value="14" hint="3 uncontacted" />}
        {w >= 2 && h === 1 && (
          <div className="mt-2 flex items-end gap-4">
            <div>
              <p className="figures text-[34px] leading-none">14</p>
              <p className="mt-1 text-[11px] font-medium text-accent-dark">3 uncontacted</p>
            </div>
            <div className="mb-1 min-w-0 flex-1">
              <Bars data={LEADS_12W} />
              <p className="mt-1 text-[9px] text-muted">last 12 weeks</p>
            </div>
          </div>
        )}
        {w === 1 && h >= 2 && (
          <>
            <BigCount value="14" hint="3 uncontacted" />
            <RowList
              rows={tenantLeads.slice(0, h >= 3 ? 9 : 5).map((l) => ({ a: l.received, b: l.name, c: l.source }))}
              max={h >= 3 ? 9 : 5}
            />
          </>
        )}
        {w >= 2 && h >= 2 && (
          <div className="mt-3 grid grid-cols-2 gap-5">
            <div>
              <p className="figures text-[34px] leading-none">14</p>
              <p className="mt-1 text-[11px] font-medium text-accent-dark">3 uncontacted today</p>
              <div className="mt-3">
                <LineGraph data={LEADS_12M} tall />
                <p className="mt-1 text-[9px] text-muted">last 12 months · 502 leads</p>
              </div>
            </div>
            <RowList
              rows={tenantLeads.slice(0, h >= 3 ? 10 : 6).map((l) => ({ a: l.received, b: l.name, c: l.source }))}
              max={h >= 3 ? 10 : 6}
            />
          </div>
        )}
      </>
    ),
  },

  "on-market": {
    label: "On market", icon: "pack/house", hint: "count → by status → the slow movers",
    defaultW: 1, defaultH: 1,
    render: (w, h) => (
      <>
        <Head icon="pack/house" label="On market" />
        {w === 1 && h === 1 && <BigCount value="24" hint="2 under offer" />}
        {(w >= 2 || h >= 2) && (
          <>
            <div className="mt-2 flex items-end gap-5">
              <p className="figures text-[34px] leading-none">24</p>
              <div className="mb-0.5 flex gap-4 text-[11px]">
                <span><span className="figures text-[15px]">18</span> <span className="text-muted">available</span></span>
                <span><span className="figures text-[15px]">2</span> <span className="text-muted">under offer</span></span>
                <span><span className="figures text-[15px]">4</span> <span className="text-muted">let agreed</span></span>
              </div>
            </div>
            {h >= 2 && (
              <>
                <p className="mt-4 text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Slowest movers
                </p>
                <RowList
                  rows={[
                    { a: "44d", b: "8 Recreation Terrace", c: "no photos" },
                    { a: "31d", b: "228a Chapter Road", c: "price?" },
                    { a: "19d", b: "108 Cherry Tree Drive" },
                    { a: "12d", b: "Flat 2, Mercer Street" },
                  ]}
                  max={w >= 2 ? 4 : 3}
                />
              </>
            )}
          </>
        )}
      </>
    ),
  },

  applications: {
    label: "Applications", icon: "pack/checklist", hint: "count → by stage → the stalled",
    defaultW: 1, defaultH: 1,
    render: (w, h) => (
      <>
        <Head icon="pack/checklist" label="Applications" />
        {w === 1 && h === 1 && <BigCount value="6" hint="1 stalled" />}
        {(w >= 2 || h >= 2) && (
          <>
            <div className="mt-2 flex items-end gap-5">
              <p className="figures text-[34px] leading-none">6</p>
              <div className="mb-0.5 flex gap-4 text-[11px]">
                <span><span className="figures text-[15px]">2</span> <span className="text-muted">new</span></span>
                <span><span className="figures text-[15px]">3</span> <span className="text-muted">referencing</span></span>
                <span><span className="figures text-[15px]">1</span> <span className="text-muted">signing</span></span>
              </div>
            </div>
            {h >= 2 && (
              <>
                <p className="mt-4 text-[10px] font-semibold uppercase tracking-wide text-muted">Needs a push</p>
                <RowList
                  rows={[
                    { a: "6d", b: "Flat 2, Mercer St — referencing stalled", c: "chase" },
                    { a: "2d", b: "Flat A, Milton Rd — awaiting guarantor" },
                  ]}
                  max={2}
                />
              </>
            )}
          </>
        )}
      </>
    ),
  },

  occupancy: {
    label: "Occupancy", icon: "pack/building", hint: "the % → the voids → what they cost",
    defaultW: 1, defaultH: 1,
    render: (w, h) => (
      <>
        <Head icon="pack/building" label="Occupancy" />
        {w === 1 && h === 1 && <BigCount value="93%" hint="of the managed book" />}
        {(w >= 2 || h >= 2) && (
          <>
            <div className="mt-2 flex items-center gap-4">
              <Donut
                centre="93%"
                sub="occupied"
                parts={[
                  { value: 529, color: "var(--accent-dark)" },
                  { value: 39, color: "var(--accent-soft)" },
                ]}
              />
              <div className="min-w-0 flex-1">
                <p className="text-[12px]"><span className="figures text-[16px]">529</span> <span className="text-muted">occupied</span></p>
                <p className="mt-1 text-[12px]"><span className="figures text-[16px]">39</span> <span className="text-muted">standing empty</span></p>
              </div>
            </div>
            {h >= 2 && (
              <>
                {/* The next stage of "93%": the 7% — who's empty, for how
                    long, and what it costs. Occupancy is a rent number
                    wearing a percentage. */}
                <p className="mt-4 text-[10px] font-semibold uppercase tracking-wide text-muted">
                  The voids, and the rent they&apos;re not paying
                </p>
                <RowList
                  rows={VOIDS.map((v) => ({
                    a: `${v.weeks}w`, b: v.name, c: `−£${v.rent}/mo`,
                  }))}
                  max={w >= 2 ? 4 : 3}
                />
                {w >= 2 && (
                  <p className="mt-3 border-t border-line/50 pt-2 text-[11px] font-semibold text-accent-dark">
                    £3,165/month walking out the door — relet these first.
                  </p>
                )}
              </>
            )}
          </>
        )}
      </>
    ),
  },

  attention: {
    label: "Needs attention", icon: "bell", hint: "the tickable worry list",
    defaultW: 1, defaultH: 2,
    sizes: { s: [1, 1], m: [1, 2], l: [2, 2] },
    render: (w, h) => <AttentionWidget w={w} h={h} />,
  },

  diary: {
    label: "Diary", icon: "calendar", hint: "the day → the week → the whole grid, as it grows",
    defaultW: 2, defaultH: 2,
    sizes: { s: [1, 1], m: [2, 2], l: [4, 3] },
    render: (w, h) => <DiaryWidget w={w} h={h} />,
  },

  today: {
    label: "Today", icon: "calendar", hint: "the diary — opens the full calendar",
    defaultW: 1, defaultH: 2,
    sizes: { s: [1, 1], m: [1, 2], l: [2, 2] },
    render: (w, h) => <TodayWidget w={w} h={h} />,
  },

  "lead-sources": {
    label: "Lead sources", icon: "pie", hint: "top source → bars → the full chart",
    defaultW: 1, defaultH: 2,
    sizes: { s: [1, 1], m: [1, 2], l: [2, 2] },
    render: (w, h) => (
      <>
        <div className="flex items-center justify-between gap-2">
          <Head icon="pie" label="Lead sources" />
          {w >= 2 && <FlowTag from="REX + GHL" />}
        </div>
        {h === 1 ? (
          <BigCount value="50%" hint="Portals — biggest source" />
        ) : (
          <div className="mt-2">
            <LeadSourceChart />
            <Link href="/leads" className="mt-3 block text-[11px] font-semibold text-muted transition-colors hover:text-ink">
              All leads →
            </Link>
          </div>
        )}
      </>
    ),
  },

  pipeline: {
    label: "Pipeline snapshot", icon: "trend-up", hint: "the journey in numbers; taller adds conversion",
    defaultW: 4, defaultH: 1,
    sizes: { s: [2, 1], m: [4, 1], l: [4, 2] },
    render: (w, h) => {
      const STAGES = [
        { label: "Leads", value: 14, href: "/leads" },
        { label: "Appointments", value: 9, href: "/viewings" },
        { label: "Appraisals", value: 3 },
        { label: "Properties", value: 24, href: "/listings" },
        { label: "Applications", value: 6, href: "/applications" },
        { label: "Portfolio", value: 568, href: "/portfolio" },
        { label: "Move-ins", value: 2 },
      ].slice(0, w >= 4 ? 7 : w >= 2 ? 4 : 2);
      return (
        <>
          <div className="mb-3 flex items-center justify-between gap-3">
            <Head icon="trend-up" label="Pipeline snapshot" />
            {w >= 3 && <FlowTag from="REX + PayProp" />}
          </div>
          <div className={`grid gap-4 ${w >= 4 ? "grid-cols-7" : w >= 2 ? "grid-cols-4" : "grid-cols-2"}`}>
            {STAGES.map((p, i) => {
              const inner = (
                <>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-accent" />
                    <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted">
                      {p.label}
                    </span>
                  </span>
                  <span className="figures mt-1.5 block text-[24px] leading-none">{p.value}</span>
                  {/* Taller: the story BETWEEN the numbers. */}
                  {h >= 2 && i < STAGES.length - 1 && (
                    <span className="figures mt-2 block text-[10.5px] text-accent-dark">
                      {["64%", "33%", "—", "25%", "—", "0.4%"][i] ?? "—"} convert →
                    </span>
                  )}
                </>
              );
              return p.href ? (
                <Link key={p.label} href={p.href} className="min-w-0 transition-opacity hover:opacity-70">{inner}</Link>
              ) : (
                <div key={p.label} className="min-w-0">{inner}</div>
              );
            })}
          </div>
          {h >= 2 && (
            <p className="mt-3 border-t border-line/50 pt-2 text-[10px] text-muted">
              Conversion figures are placeholders until the history store lands — the shape is the point.
            </p>
          )}
        </>
      );
    },
  },

  "facebook-leads": {
    label: "Facebook leads", icon: "megaphone", hint: "via GoHighLevel",
    defaultW: 1, defaultH: 1,
    render: (w, h) => (
      <>
        <Head icon="megaphone" label="Facebook leads" />
        {w === 1 && h === 1 ? (
          <BigCount value="9" hint="+4 this week · via GHL" />
        ) : (
          <div className="mt-2 flex items-end gap-4">
            <div>
              <p className="figures text-[34px] leading-none">9</p>
              <p className="mt-1 text-[11px] font-medium text-accent-dark">+4 this week</p>
            </div>
            <div className="mb-1 min-w-0 flex-1">
              <Bars data={FB_8W} tall={h >= 2} />
              <p className="mt-1 text-[9px] text-muted">8 weeks · via GoHighLevel</p>
            </div>
          </div>
        )}
      </>
    ),
  },

  "instagram-leads": {
    label: "Instagram leads", icon: "star", hint: "via GoHighLevel",
    defaultW: 1, defaultH: 1,
    render: (w, h) => (
      <>
        <Head icon="star" label="Instagram leads" />
        {w === 1 && h === 1 ? (
          <BigCount value="4" hint="+2 this week · via GHL" />
        ) : (
          <div className="mt-2 flex items-end gap-4">
            <div>
              <p className="figures text-[34px] leading-none">4</p>
              <p className="mt-1 text-[11px] font-medium text-accent-dark">+2 this week</p>
            </div>
            <div className="mb-1 min-w-0 flex-1">
              <Bars data={IG_8W} tall={h >= 2} />
              <p className="mt-1 text-[9px] text-muted">8 weeks · via GoHighLevel</p>
            </div>
          </div>
        )}
      </>
    ),
  },

  "ads-live": {
    label: "Ads running", icon: "rocket", hint: "what's live and what each lead costs",
    defaultW: 1, defaultH: 1,
    render: (w, h) => (
      <>
        <Head icon="rocket" label="Ads running" />
        {w === 1 && h === 1 ? (
          <BigCount value="3" hint="13 leads this week" />
        ) : (
          <RowList
            rows={ADS.map((a) => ({ a: String(a.leads), b: `${a.name} · ${a.platform}`, c: a.spend }))}
            max={3}
          />
        )}
      </>
    ),
  },

  news: {
    label: "News", icon: "megaphone", hint: "what landlords are reading today",
    defaultW: 1, defaultH: 1,
    render: (w, h) => <NewsWidget w={w} h={h} />,
  },
  "compliance-due": {
    label: "Compliance due", icon: "shield", hint: "certificates dying this month",
    defaultW: 1, defaultH: 1,
    render: (w, h) => {
      const due = dueWithin(30);
      return (
        <Link href="/compliance" className="block">
          <Head icon="shield" label="Compliance due" />
          {w === 1 && h === 1 ? (
            <BigCount value={String(due.length)} hint="expired or due in 30 days" />
          ) : (
            <RowList
              rows={due.map((d) => ({
                a: d.cert?.expires != null && d.cert.expires < 0 ? `${Math.abs(d.cert.expires)}d over` : `${d.cert?.expires}d`,
                b: `${d.p.name} — ${CERT_META[d.key].short}`,
                c: d.p.landlord,
              }))}
              max={h >= 2 ? (w >= 2 ? 8 : 6) : 3}
            />
          )}
        </Link>
      );
    },
  },

  portfolio: {
    label: "Portfolio size", icon: "folder", hint: "the managed book, and how it's growing",
    defaultW: 1, defaultH: 1,
    render: (w, h) => (
      <>
        <Head icon="folder" label="Portfolio" />
        {w === 1 && h === 1 ? (
          <BigCount value="568" hint="+27 this year" />
        ) : (
          <>
            <div className="mt-2 flex items-end gap-4">
              <div>
                <p className="figures text-[34px] leading-none">568</p>
                <p className="mt-1 text-[11px] font-medium text-accent-dark">homes managed</p>
              </div>
              <div className="mb-1 min-w-0 flex-1">
                <Bars data={[541, 544, 546, 549, 551, 553, 558, 560, 561, 563, 566, 568]} tall={h >= 2} />
                <p className="mt-1 text-[9px] text-muted">12 months · +27</p>
              </div>
            </div>
            {h >= 2 && (
              <>
                <p className="mt-4 text-[10px] font-semibold uppercase tracking-wide text-muted">This month</p>
                <RowList
                  rows={[
                    { a: "+2", b: "New instructions taken on", c: "MA wins" },
                    { a: "+1", b: "Switched from another agent" },
                    { a: "−1", b: "Sold — landlord exited", c: "22 Ashfield Rd" },
                  ]}
                  max={3}
                />
              </>
            )}
          </>
        )}
      </>
    ),
  },

  earnings: {
    label: "Earnings this month", icon: "wallet", hint: "fees landed — net of VAT, by stream",
    defaultW: 1, defaultH: 1,
    render: (w, h) => (
      <>
        <Head icon="wallet" label="Earnings this month" />
        {w === 1 && h === 1 ? (
          <BigCount value="£38.4k" hint="net of VAT · +6% on last month" />
        ) : (
          <>
            <div className="mt-2 flex items-end gap-4">
              <div>
                <p className="figures text-[34px] leading-none">£38.4k</p>
                <p className="mt-1 text-[11px] font-medium text-accent-dark">+6% on last month</p>
              </div>
              <div className="mb-1 min-w-0 flex-1">
                <LineGraph data={[31, 34, 33, 36, 32, 35, 37, 34, 38, 36, 36, 38.4]} tall={h >= 2} />
                <p className="mt-1 text-[9px] text-muted">12 months · net of VAT</p>
              </div>
            </div>
            {h >= 2 && (
              <>
                <p className="mt-4 text-[10px] font-semibold uppercase tracking-wide text-muted">By stream</p>
                <RowList
                  rows={[
                    { a: "£29.1k", b: "Management fees", c: "76%" },
                    { a: "£6.8k", b: "Letting & renewal fees", c: "18%" },
                    { a: "£2.5k", b: "Other agency income", c: "6%" },
                  ]}
                  max={3}
                />
                {w >= 2 && (
                  <p className="mt-3 border-t border-line/50 pt-2 text-[10px] text-muted">
                    Counted the PayProp way: fees belong to the month the batch transferred,
                    every figure net of VAT — so this always agrees with the bank.
                  </p>
                )}
              </>
            )}
          </>
        )}
      </>
    ),
  },

  "recently-listed": {
    label: "Recently listed", icon: "megaphone", hint: "what just went live, and is it moving",
    defaultW: 1, defaultH: 1,
    render: (w, h) => (
      <>
        <Head icon="megaphone" label="Recently listed" />
        {w === 1 && h === 1 ? (
          <BigCount value="3" hint="live this week" />
        ) : (
          <RowList
            rows={[
              { a: "1d", b: "12 Elm Gardens — £1,200 pcm", c: "4 enquiries" },
              { a: "3d", b: "6 Sandpiper Way — £850 pcm", c: "2 viewings" },
              { a: "5d", b: "Flat A, 41 Milton Road — £795 pcm", c: "quiet — check photos" },
            ]}
            max={h >= 2 ? 3 : 2}
          />
        )}
      </>
    ),
  },

  arrears: {
    label: "Rent arrears", icon: "coin", hint: "who owes what, and for how long",
    defaultW: 1, defaultH: 1,
    render: (w, h) => (
      <>
        <Head icon="coin" label="Rent arrears" />
        {w === 1 && h === 1 ? (
          <BigCount value="£2,340" hint="3 tenancies behind" />
        ) : (
          <>
            <div className="mt-2 flex items-center gap-4">
              <Donut
                centre="99.2%"
                sub="collected"
                parts={[
                  { value: 99.2, color: "var(--accent-dark)" },
                  { value: 0.8, color: "var(--accent-soft)" },
                ]}
              />
              <div className="min-w-0 flex-1">
                <p className="figures text-[22px] leading-none">£2,340</p>
                <p className="mt-1 text-[11px] text-muted">outstanding across 3 tenancies</p>
              </div>
            </div>
            {h >= 2 && (
              <RowList
                rows={[
                  { a: "£1,190", b: "Flat 2, Mercer Street", c: "34 days" },
                  { a: "£750", b: "183 Walesby Lane", c: "12 days" },
                  { a: "£400", b: "88 Kelvin Way", c: "5 days" },
                ]}
                max={3}
              />
            )}
          </>
        )}
      </>
    ),
  },

  maintenance: {
    label: "Maintenance jobs", icon: "setting", hint: "what's open, what's urgent",
    defaultW: 1, defaultH: 1,
    render: (w, h) => (
      <>
        <Head icon="setting" label="Maintenance jobs" />
        {w === 1 && h === 1 ? (
          <BigCount value="7" hint="2 urgent" />
        ) : (
          <RowList
            rows={[
              { a: "2d", b: "Boiler down — Flat A, Milton Road", c: "URGENT" },
              { a: "4d", b: "Leak under sink — 41 Harewood Road", c: "URGENT" },
              { a: "6d", b: "Fence panel — 12 Elm Gardens" },
              { a: "9d", b: "Extractor fan — 108 Cherry Tree Drive" },
              { a: "15d", b: "Guttering — 8 Recreation Terrace" },
            ]}
            max={h >= 2 ? 5 : 3}
          />
        )}
      </>
    ),
  },

  renewals: {
    label: "Tenancies ending", icon: "file-contract", hint: "renew or re-let — the next 60 days",
    defaultW: 1, defaultH: 1,
    render: (w, h) => (
      <>
        <Head icon="file-contract" label="Tenancies ending" />
        {w === 1 && h === 1 ? (
          <BigCount value="5" hint="in the next 60 days" />
        ) : (
          <>
            <RowList
              rows={[
                { a: "12d", b: "Flat 2, Mercer Street", c: "renewal offered" },
                { a: "23d", b: "6 Sandpiper Way", c: "no reply yet" },
                { a: "31d", b: "44 Priory Court (rm 2)", c: "leaving — re-let" },
                { a: "44d", b: "88 Kelvin Way", c: "renewal likely" },
                { a: "58d", b: "183 Walesby Lane", c: "chase" },
              ]}
              max={h >= 2 ? 5 : 3}
            />
            {h >= 2 && w >= 2 && (
              <p className="mt-3 border-t border-line/50 pt-2 text-[10px] text-muted">
                Every unanswered renewal is a void in waiting — chase the quiet ones first.
              </p>
            )}
          </>
        )}
      </>
    ),
  },

  "viewings-week": {
    label: "Viewings", icon: "key", hint: "coming up — and what the last ones said",
    defaultW: 1, defaultH: 1,
    sizes: { s: [1, 1], m: [1, 2], l: [2, 2] },
    render: (w, h) => <ViewingsWeekWidget w={w} h={h} />,
  },

  /* ── Terms nobody has signed yet. The property record answers "did THIS
     one sign"; this answers the question an office actually asks on a
     Monday, which is who is still sitting on ours. A component rather than
     an inline renderer because it reads REX live and opens its own modal. ── */
  "terms-outstanding": {
    label: "Terms to sign",
    icon: "file-contract",
    hint: "Landlords who still haven't signed their terms of business, oldest first",
    defaultW: 1, defaultH: 1,
    sizes: { s: [1, 1], m: [2, 1], l: [2, 2] },
    render: (w, h) => <OutstandingTermsWidget w={w} h={h} />,
  },
};

/** The default board IS today's dashboard, box for box. */
export const DEFAULT_LAYOUT: { id: string; type: string; w: number; h: number }[] = [
  { id: "d1", type: "leads-today", w: 1, h: 1 },
  { id: "d2", type: "on-market", w: 1, h: 1 },
  { id: "d3", type: "applications", w: 1, h: 1 },
  { id: "d4", type: "occupancy", w: 1, h: 1 },
  { id: "d5", type: "attention", w: 1, h: 2 },
  { id: "d6", type: "today", w: 1, h: 2 },
  { id: "d7", type: "lead-sources", w: 2, h: 2 },
  { id: "d8", type: "pipeline", w: 4, h: 1 },
];

/** The dashboard's tray drawers. Finances has its own set. */

/* ── Viewings this week, plus what the last ones said. A component rather
      than an inline renderer so it can read the live diary. ── */
function ViewingsWeekWidget({ w, h }: { w: number; h: number }) {
  const { appts } = useDiary();
  const week = appts.filter((a) => a.kind === "viewing" && a.day >= 0 && a.day <= 6);
  const past = appts.filter((a) => a.kind === "viewing" && a.day < 0).sort((a, b) => b.day - a.day);
      const rows = (list: typeof week, upcoming: boolean) =>
        list.slice(0, h >= 2 ? 4 : 2).map((v) => ({
          a: upcoming ? (v.day === 0 ? v.start : `+${v.day}d`) : `${-v.day}d ago`,
          b: v.what.replace(/^[^—]+—\s*/, ""),
          c: upcoming ? v.who : (VIEWING_OUTCOMES[v.id] ?? "feedback due"),
        }));
      return (
        <>
          <Head icon="key" label="Viewings" />
          {w === 1 && h === 1 ? (
            <BigCount value={String(week.length)} hint={`${past.length} done — ${Object.values(VIEWING_OUTCOMES).filter((o) => o === "Applying").length} applying`} />
          ) : (
            <div className={w >= 2 ? "mt-4 grid grid-cols-2 gap-5" : "mt-4"}>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Coming up</p>
                <RowList rows={rows(week, true)} max={h >= 2 ? 4 : 2} />
              </div>
              <div className={w >= 2 ? "" : "mt-4"}>
                {/* The ones that HAPPENED — feedback is what landlords wait on,
                    so the past earns equal billing with the future. */}
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Been — what they said
                </p>
                <RowList rows={rows(past, false)} max={h >= 2 ? 4 : 2} />
              </div>
            </div>
          )}
        </>
      )
}

export const DASH_TRAY_GROUPS = [
  { key: "performance", label: "Performance", icon: "trend-up", types: ["leads-today", "lead-sources", "pipeline", "earnings", "applications"] },
  { key: "social", label: "Social & ads", icon: "megaphone", types: ["facebook-leads", "instagram-leads", "ads-live"] },
  { key: "book", label: "The book", icon: "folder", types: ["portfolio", "on-market", "occupancy", "recently-listed"] },
  { key: "diary", label: "People & diary", icon: "calendar", types: ["diary", "today", "viewings-week", "attention"] },
  { key: "management", label: "Management", icon: "setting", types: ["arrears", "maintenance", "renewals", "terms-outstanding"] },
  { key: "compliance", label: "Compliance", icon: "shield", types: ["compliance-due"] },
  { key: "news", label: "News", icon: "megaphone", types: ["news"] },
];
