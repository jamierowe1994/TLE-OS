"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import PortalMarket from "@/components/listing/PortalMarket";
import type { PortalStat } from "@/lib/rex-portal-stats";
import type { HistoryPoint, Market } from "@/lib/portal-market";

/**
 * How the advert is doing, at a glance (James, 25 Oct 2026: "a really
 * polished, simplistic view where they can quite clearly see how the
 * property is performing... the stats are really good, but they're also
 * confusing unless you really dig into each point").
 *
 * Floating on a darkened screen the way Search is (James, 25 Oct 2026: "break
 * it down into boxes... we don't always have to use a white background... it
 * should be really animated when they come up"): the heading and where it
 * ranks sit on the dark with no box, and everything else is its own box, each
 * rising in on its own beat. A verdict in a sentence, three plain comparisons
 * with the average live home, each portal and the views to date. The full
 * breakdown (components/listing/PortalMarket) is one press away. Same read,
 * /api/listings/stats.
 */

/** Each piece arrives a beat after the one before. */
const beat = (i: number) => ({ animationDelay: `${120 + i * 90}ms` });

type Answer = {
  ok: boolean;
  error?: string;
  portals?: PortalStat[];
  totals?: { detail: number | null; summary: number | null; ctr: number | null };
  empty?: boolean;
  market?: Market | null;
  history?: HistoryPoint[];
};

const num = (n: number | null | undefined, dp = 0) => (n == null ? "-" : n.toLocaleString("en-GB", { maximumFractionDigits: dp, minimumFractionDigits: 0 }));
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;

/** "34% more than the average" / "12% fewer" / "about the same". */
function versus(me: number | null | undefined, avg: number | null | undefined, more = "more", fewer = "fewer") {
  if (me == null || !avg) return { text: "No average to compare with yet", tone: "flat" as const };
  const d = Math.round(((me - avg) / avg) * 100);
  if (Math.abs(d) < 5) return { text: "About the same as the average home", tone: "flat" as const };
  return d > 0 ? { text: `${d}% ${more} than the average home`, tone: "up" as const } : { text: `${Math.abs(d)}% ${fewer} than the average home`, tone: "down" as const };
}

/** This home against the average, as two bars on one scale. */
function Compare({ label, help, me, avg, unit, dp = 0, more, fewer, i }: { label: string; help: string; me: number | null | undefined; avg: number | null | undefined; unit?: string; dp?: number; more?: string; fewer?: string; i: number }) {
  const top = Math.max(me ?? 0, avg ?? 0) * 1.08 || 1;
  const v = versus(me, avg, more, fewer);
  return (
    <div className="nl-po-cmp nl-po-box nl-po-in" style={beat(i)}>
      <div className="nl-po-cmp-head">
        <span className="nl-po-cmp-label">{label}</span>
        <span className={`nl-po-cmp-vs is-${v.tone}`}>{v.text}</span>
      </div>
      <p className="nl-po-cmp-help">{help}</p>
      <div className="nl-po-bars">
        <div className="nl-po-bar is-me">
          <span className="nl-po-bar-who">This home</span>
          <span className="nl-po-bar-track"><i style={{ width: `${((me ?? 0) / top) * 100}%` }} /></span>
          <b>{num(me, dp)}{unit}</b>
        </div>
        <div className="nl-po-bar">
          <span className="nl-po-bar-who">Average home</span>
          <span className="nl-po-bar-track"><i style={{ width: `${((avg ?? 0) / top) * 100}%` }} /></span>
          <b>{num(avg, dp)}{unit}</b>
        </div>
      </div>
    </div>
  );
}

/** The views to date, as a quiet line. */
function Line({ history }: { history: HistoryPoint[] }) {
  const pts = history.filter((h) => h.detail != null);
  if (pts.length < 2) return null;
  const W = 600;
  const H = 70;
  const vals = pts.map((p) => p.detail as number);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 1;
  const x = (i: number) => (i / (pts.length - 1)) * W;
  const y = (v: number) => H - 6 - ((v - lo) / span) * (H - 12);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.detail as number).toFixed(1)}`).join(" ");
  return (
    <svg className="nl-po-line" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      <path d={`${d} L${W},${H} L0,${H} Z`} className="nl-po-line-fill" />
      <path d={d} className="nl-po-line-ln" />
    </svg>
  );
}

export default function PortalOverview({
  open,
  onClose,
  listingId,
  name,
  liveSince,
  links,
}: {
  open: boolean;
  onClose: () => void;
  listingId: string;
  name: string;
  liveSince: string | null;
  links: { portal: string; url: string }[];
}) {
  const [a, setA] = useState<Answer | null>(null);
  const [full, setFull] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!open) {
      setShown(false);
      setFull(false);
      return;
    }
    const t = requestAnimationFrame(() => setShown(true));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const was = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(t);
      window.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = was;
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setA(null);
    fetch(`/api/listings/stats?id=${encodeURIComponent(listingId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: Answer) => live && setA(j))
      .catch(() => live && setA({ ok: false, error: "The portal figures didn't load. Try again in a minute." }));
    return () => {
      live = false;
    };
  }, [open, listingId]);

  if (!open || typeof document === "undefined") return null;
  const m = a?.market ?? null;
  const me = m?.me ?? null;
  const days = me?.daysLive ?? (liveSince ? Math.max(1, Math.round((Date.now() - new Date(liveSince).getTime()) / 86_400_000)) : null);

  /* The verdict: where it ranks, and the one thing worth looking at. */
  let verdict: { tone: "good" | "mid" | "look"; title: string; line: string } | null = null;
  if (m && me && m.rank && m.homes > 1) {
    const top = m.rank <= Math.ceil(m.homes / 4);
    const bottom = m.rank > Math.floor((m.homes * 3) / 4);
    const seenLow = me.appearancesPerDay != null && m.average.appearancesPerDay != null && me.appearancesPerDay < m.average.appearancesPerDay * 0.8;
    const openedLow = me.ctr != null && m.average.ctr != null && me.ctr < m.average.ctr * 0.8;
    verdict = top
      ? { tone: "good", title: "Doing well", line: `One of the most viewed homes on the portals: ${ordinal(m.rank)} of ${m.homes}.` }
      : bottom
        ? {
            tone: "look",
            title: "Worth a look",
            line: openedLow
              ? "It's coming up in searches but not being opened. The main photo, headline and price are the place to start."
              : seenLow
                ? "It isn't coming up in many searches. Check the price against similar homes and the area it's listed in."
                : `Fewer views than most homes on the portals: ${ordinal(m.rank)} of ${m.homes}.`,
          }
        : { tone: "mid", title: "About average", line: `In the middle of the pack: ${ordinal(m.rank)} of ${m.homes} homes on the portals.` };
  }
  const pos = m?.rank && m.homes > 1 ? ((m.rank - 1) / (m.homes - 1)) * 100 : null;
  const portalRows = (m?.portals ?? []).filter((p) => p.viewsPerDay != null || p.marketViewsPerDay != null);

  return createPortal(
    <div data-look="new" className="nl-po" data-shown={shown} role="dialog" aria-modal="true" aria-label={`${name} on the portals`}>
      <button type="button" className="nl-po-scrim" aria-label="Close" onClick={onClose} />
      <div className="nl-po-card">
        <div className="nl-po-head nl-po-in" style={{ animationDelay: "40ms" }}>
          <div className="min-w-0 flex-1">
            <p className="nl-eyebrow">On the portals{days ? ` · live ${days} ${days === 1 ? "day" : "days"}` : ""}</p>
            <h2 className="nl-po-title">How {name} is doing</h2>
            {links.length > 0 && (
              <p className="nl-po-links">
                {links.map((l) => (
                  <a key={l.portal} href={l.url} target="_blank" rel="noopener noreferrer">
                    {l.portal}
                  </a>
                ))}
              </p>
            )}
          </div>
          <button type="button" className="nl-iconbtn" aria-label="Close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="nl-po-body">
          {!a ? (
            <p className="nl-po-wait">
              <span className="nl-po-spin" aria-hidden />
              Reading the portals…
            </p>
          ) : !a.ok ? (
            <p className="nl-po-note is-bad">{a.error ?? "The portal figures didn't load."}</p>
          ) : a.empty ? (
            <p className="nl-po-note">The portals have nothing recorded for this home yet. Figures usually show the day after it goes live.</p>
          ) : (
            <>
              {verdict ? (
                <section className={`nl-po-verdict nl-po-in is-${verdict.tone}`} style={beat(0)}>
                  <span className="nl-po-verdict-dot" aria-hidden />
                  <div>
                    <p className="nl-po-verdict-title">{verdict.title}</p>
                    <p className="nl-po-verdict-line">{verdict.line}</p>
                  </div>
                </section>
              ) : (
                <p className="nl-po-note nl-po-box nl-po-in" style={beat(0)}>The comparison with other homes builds as today&apos;s figures are read. Look again in a minute.</p>
              )}

              {me && m && (
                <div className="nl-po-cmps">
                  <Compare i={1} label="Views a day" help="People opening the advert itself." me={me.viewsPerDay} avg={m.average.viewsPerDay} dp={1} />
                  <Compare i={2} label="Seen in searches a day" help="Times it came up in someone's results." me={me.appearancesPerDay} avg={m.average.appearancesPerDay} />
                  <Compare i={3} label="Opened from a search" help="Of the times it was seen, how often it was opened. The photos, headline and price at work." me={me.ctr} avg={m.average.ctr} unit="%" dp={1} more="higher" fewer="lower" />
                </div>
              )}

              {pos != null && m?.rank && (
                <section className="nl-po-rank nl-po-in" style={beat(4)}>
                  <div className="nl-po-sec-head">
                    <h3>Where it ranks</h3>
                    <span>{ordinal(m.rank)} of {m.homes} homes on the portals, by views a day</span>
                  </div>
                  <div className="nl-po-track" aria-hidden>
                    <span className="nl-po-track-q is-top" />
                    <span className="nl-po-track-q" />
                    <span className="nl-po-track-q" />
                    <span className="nl-po-track-q is-bottom" />
                    <i style={{ left: `${pos}%` }} />
                  </div>
                  <div className="nl-po-track-ends">
                    <span>Most viewed</span>
                    <span>Least viewed</span>
                  </div>
                </section>
              )}

              {portalRows.length > 0 && (
                <section className="nl-po-portals nl-po-box nl-po-in" style={beat(5)}>
                  <div className="nl-po-sec-head">
                    <h3>Portal by Portal</h3>
                    <span>Views a day, this home and the average</span>
                  </div>
                  <ul>
                    {portalRows.map((p) => {
                      const v = versus(p.viewsPerDay, p.marketViewsPerDay);
                      return (
                        <li key={p.portal}>
                          <span className="nl-po-p-name">{p.portal}</span>
                          <span className="nl-po-p-me">{num(p.viewsPerDay, 1)}</span>
                          <span className="nl-po-p-avg">average {num(p.marketViewsPerDay, 1)}</span>
                          <span className={`nl-po-p-vs is-${v.tone}`}>{v.tone === "up" ? "Above" : v.tone === "down" ? "Below" : "Level"}</span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              <section className="nl-po-total nl-po-box nl-po-in" style={beat(6)}>
                <div className="nl-po-sec-head">
                  <h3>So Far</h3>
                  <span>
                    {num(a.totals?.detail)} views from {num(a.totals?.summary)} appearances
                  </span>
                </div>
                <Line history={a.history ?? []} />
              </section>

              {full && (
                <section className="nl-po-full nl-po-box nl-po-in" style={beat(0)}>
                  <PortalMarket listingId={listingId} />
                </section>
              )}
            </>
          )}
        </div>

        {a?.ok && !a.empty && (
          <div className="nl-po-foot nl-po-in" style={beat(7)}>
            <button type="button" className="nl-btn nl-btn--secondary nl-btn--sm" onClick={() => setFull((f) => !f)}>
              {full ? "Hide the full breakdown" : "See the full breakdown"}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
