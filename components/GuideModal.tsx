"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import DoodleIcon from "@/components/DoodleIcon";
import type { Guide, GuideStep } from "@/lib/guide-types";

/**
 * A guide, as a pop-up you scroll through: each step in plain words with its
 * picture beside it.
 *
 * Lifted out of Kirstie's Knowledge page (13 Sep 2026) when the agents got
 * guides of their own (16 Sep), so both sides are drawn by one component and
 * cannot drift apart. Everything a step can say is optional past its body;
 * the three labelled answers only appear when the guide has written them.
 *
 * The numbered strip under the head is where-am-I and a way to jump. A guide
 * with twelve steps is a long scroll, and "step 7 of 12" is what makes it
 * feel finishable.
 */

const SAGE = "bg-[#f1f4ec] text-[#56634a]";

export default function GuideModal({ g, onClose }: { g: Guide; onClose: () => void }) {
  const path = usePathname();
  const scroller = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  const [zoom, setZoom] = useState<GuideStep | null>(null);

  /* Escape closes the zoomed picture first, then the guide. The page behind
     does not scroll while the guide is up. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (zoom) setZoom(null);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom, onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  /* The step you are on is the last one whose top has passed a third of the
     way down the scroller. Read on scroll rather than with an observer,
     because steps are uneven heights and "most visible" flickers between two
     short ones. */
  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const line = el.getBoundingClientRect().top + el.clientHeight / 3;
    const items = el.querySelectorAll<HTMLElement>("[data-step]");
    let n = 0;
    items.forEach((it, i) => {
      if (it.getBoundingClientRect().top <= line) n = i;
    });
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 4) n = items.length - 1;
    setAt(n);
  };

  const jump = (i: number) => {
    const el = scroller.current?.querySelectorAll<HTMLElement>("[data-step]")[i];
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const onTheScreen = path === g.href.split("?")[0];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[#2b201d]/45 p-3 sm:p-6" onClick={onClose}>
      <div
        className="drawer-in relative flex max-h-[92vh] w-full max-w-[1100px] flex-col overflow-hidden rounded-[26px] bg-page shadow-[0_30px_80px_-30px_rgba(40,25,20,0.6)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={g.title}
      >
        {/* ── the head stays; the steps scroll under it ── */}
        <div className="border-b border-line/60 px-5 pb-3 pt-5 sm:px-8">
          <div className="flex items-start gap-4">
            <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark sm:flex">
              <DoodleIcon name={g.icon} size={19} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-dark">Guide</p>
              <h2 className="text-[22px] font-bold leading-tight sm:text-[26px]">{g.title}</h2>
              <p className="mt-1 text-[13px] text-muted">
                {g.steps.length} steps · about {g.minutes} minutes · step {at + 1} of {g.steps.length}
              </p>
            </div>
            {!onTheScreen ? (
              <Link
                href={g.href}
                onClick={onClose}
                className="hidden shrink-0 items-center gap-2 rounded-full border border-line/80 bg-card px-4 py-2 text-[12.5px] font-semibold transition hover:border-ink/40 sm:flex"
              >
                Open the screen <DoodleIcon name="trend-up" size={11} />
              </Link>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-card hover:text-ink"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          {/* where you are, and a way to jump */}
          <div className="mt-3 flex gap-1 overflow-x-auto pb-1" aria-label="Steps">
            {g.steps.map((s, i) => (
              <button
                key={s.title}
                type="button"
                onClick={() => jump(i)}
                title={s.title}
                aria-current={i === at ? "step" : undefined}
                className={`flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full px-2 text-[11.5px] font-semibold transition-colors ${
                  i === at ? "bg-accent-dark text-white" : i < at ? SAGE : "bg-card text-muted hover:text-ink"
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>

        <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8">
          <ol className="space-y-10">
            {g.steps.map((s, i) => (
              <li
                key={s.title}
                data-step
                className={`grid scroll-mt-2 gap-4 lg:gap-8 ${
                  /* A step with no picture reads across, not beside an empty column. */
                  s.image ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]" : "max-w-[760px]"
                }`}
              >
                <div className="flex gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-dark text-[13px] font-bold text-white">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[17px] font-bold leading-tight">{s.title}</h3>
                    <p className="mt-2 text-[13.5px] leading-relaxed text-ink/80">{s.body}</p>
                    <Answers s={s} />
                  </div>
                </div>
                {s.image ? (
                  <figure className="min-w-0">
                    {/* Capped in height, so a tall crop (a column, a drawer)
                        sits at a readable size rather than filling the width
                        and running off the bottom of the step. Click to see
                        it at full size. */}
                    <button
                      type="button"
                      onClick={() => setZoom(s)}
                      className="group block w-full overflow-hidden rounded-2xl border border-line/70 bg-card p-2 text-left transition hover:border-ink/30"
                      aria-label={`Enlarge: ${s.title}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={s.image}
                        alt={s.title}
                        className="mx-auto max-h-[480px] w-auto max-w-full rounded-xl"
                        loading={i < 2 ? "eager" : "lazy"}
                      />
                    </button>
                    {s.caption ? <figcaption className="mt-1.5 text-[11.5px] text-muted">{s.caption}</figcaption> : null}
                  </figure>
                ) : null}
              </li>
            ))}
          </ol>

          {/* Reading it is half. Where a practice run covers this guide, the
              end of the reading is the place to offer the doing. */}
          <div className="mt-10 flex flex-wrap items-center gap-3 rounded-2xl bg-accent-soft px-5 py-4">
            <span className={`flex h-9 w-9 items-center justify-center rounded-full ${SAGE}`}>
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.4}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </span>
            <p className="flex-1 text-[13.5px] font-semibold">
              {g.practice ? "That is the whole of it. Now try it for real." : "That is the whole of it."}
            </p>
            {g.practice ? (
              <Link href={g.practice.href} onClick={onClose} className="rounded-full bg-accent-dark px-4 py-2 text-[12.5px] font-semibold text-white">
                {g.practice.label}
              </Link>
            ) : null}
            {!onTheScreen ? (
              <Link
                href={g.href}
                onClick={onClose}
                className={`rounded-full px-4 py-2 text-[12.5px] font-semibold ${g.practice ? "border border-line/80 bg-card" : "bg-accent-dark text-white"}`}
              >
                Open the screen
              </Link>
            ) : null}
            <button type="button" onClick={onClose} className="rounded-full border border-line/80 bg-card px-4 py-2 text-[12.5px] font-semibold">
              Close
            </button>
          </div>
        </div>

        {/* the picture at full size, over the guide rather than a new tab */}
        {zoom?.image ? (
          <div className="absolute inset-0 z-10 flex flex-col bg-page/95 p-3 sm:p-6" onClick={() => setZoom(null)}>
            <div className="flex items-center gap-3 pb-3">
              <p className="min-w-0 flex-1 truncate text-[14px] font-bold">{zoom.title}</p>
              <button type="button" onClick={() => setZoom(null)} className="rounded-full border border-line/80 bg-card px-4 py-1.5 text-[12.5px] font-semibold">
                Back to the guide
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-line/70 bg-card p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={zoom.image} alt={zoom.title} className="mx-auto h-auto max-w-full rounded-xl" />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Why it matters, how it works, what it sends: only the ones written. */
function Answers({ s }: { s: GuideStep }) {
  const rows = [
    s.why ? { icon: "star", label: "Why it matters", text: s.why, tone: "" } : null,
    s.how ? { icon: "setting", label: "How it works", text: s.how, tone: "" } : null,
    s.sends ? { icon: "mail", label: "What it sends", text: s.sends, tone: SAGE } : null,
  ].filter(Boolean) as { icon: string; label: string; text: string; tone: string }[];
  if (!rows.length) return null;
  return (
    <div className="mt-3.5 space-y-2">
      {rows.map((r) => (
        <div key={r.label} className={`rounded-xl px-3.5 py-2.5 ${r.tone || "border border-line/60 bg-card"}`}>
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em]">
            <DoodleIcon name={r.icon} size={12} className={r.tone ? "" : "text-accent-dark"} />
            {r.label}
          </p>
          <p className={`mt-1 text-[12.5px] leading-relaxed ${r.tone ? "" : "text-ink/75"}`}>{r.text}</p>
        </div>
      ))}
    </div>
  );
}
