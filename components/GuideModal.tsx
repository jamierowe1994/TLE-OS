"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import DoodleIcon from "@/components/DoodleIcon";
import type { Guide, GuideStep } from "@/lib/guide-types";

/**
 * A guide, as a pop-up that reads like an article.
 *
 * James, 16 Sep 2026: "we want it to read more like an article rather than a
 * guide, I guess, but just with the addition of screenshots." So: a title and
 * a standfirst, a picture at the top of where the thing lives, then one
 * column of prose at a comfortable measure with each screenshot set into the
 * text just after the paragraph that describes it. The why and the how are
 * written into the flow as run-in paragraphs rather than stacked boxes; only
 * "What it sends" is set apart, because it is the part an agent cannot see
 * from their own screen.
 *
 * Shared by Kirstie's pre-tenancy guides and the agents' guides, so both read
 * the same. The thin line under the bar is how far through you are.
 */

const SAGE = "bg-[#f1f4ec] text-[#56634a]";

/** Body copy at a reading size and measure. */
const PROSE = "text-[15.5px] leading-[1.75] text-ink/85";

type Zoom = { src: string; title: string };

export default function GuideModal({ g, onClose }: { g: Guide; onClose: () => void }) {
  const path = usePathname();
  const scroller = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [zoom, setZoom] = useState<Zoom | null>(null);

  /* Escape closes the enlarged picture first, then the guide. The page behind
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

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const room = el.scrollHeight - el.clientHeight;
    setProgress(room > 0 ? Math.min(1, el.scrollTop / room) : 1);
  };

  const onTheScreen = path === g.href.split("?")[0];
  const cover = g.cover ?? g.steps[0]?.image ?? null;
  const coverIsFirstStep = !g.cover && Boolean(g.steps[0]?.image);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[#2b201d]/45 p-2 sm:p-6" onClick={onClose}>
      <div
        className="drawer-in relative flex max-h-[94vh] w-full max-w-[960px] flex-col overflow-hidden rounded-[26px] bg-page shadow-[0_30px_80px_-30px_rgba(40,25,20,0.6)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={g.title}
      >
        {/* ── a quiet bar: what you are reading, and how far through ── */}
        <div className="relative flex items-center gap-3 border-b border-line/60 px-4 py-2.5 sm:px-6">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
            <DoodleIcon name={g.icon} size={14} />
          </span>
          <p className="min-w-0 flex-1 truncate text-[13px] font-semibold">{g.title}</p>
          {!onTheScreen ? (
            <Link
              href={g.href}
              onClick={onClose}
              className="hidden shrink-0 items-center gap-2 rounded-full border border-line/80 bg-card px-3.5 py-1.5 text-[12px] font-semibold transition hover:border-ink/40 sm:flex"
            >
              Open the screen <DoodleIcon name="trend-up" size={11} />
            </Link>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-card hover:text-ink"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
          <span
            aria-hidden
            className="absolute bottom-[-1px] left-0 h-[2px] bg-accent-dark transition-[width] duration-150"
            style={{ width: `${progress * 100}%` }}
          />
        </div>

        <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
          <article className="px-5 pb-10 pt-8 sm:px-10 sm:pt-12">
            {/* ── the head of the article ── */}
            <header className="mx-auto max-w-[680px]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-dark">
                Guide · {g.minutes} min read
              </p>
              <h1 className="mt-3 text-[30px] font-bold leading-[1.08] sm:text-[40px]">{g.title}</h1>
              <p className="mt-4 text-[17px] leading-relaxed text-muted sm:text-[18.5px]">{g.blurb}</p>
            </header>

            {cover ? (
              <Figure
                src={cover}
                title={g.title}
                caption={g.coverCaption ?? (coverIsFirstStep ? g.steps[0].caption : undefined)}
                eager
                onZoom={setZoom}
              />
            ) : null}

            <div className="mx-auto max-w-[680px]">
              {g.intro ? <p className={`mt-8 ${PROSE}`}>{g.intro}</p> : null}

              {g.steps.map((s, i) => (
                <Section key={s.title} s={s} n={i + 1} showImage={!(i === 0 && coverIsFirstStep)} onZoom={setZoom} />
              ))}

              {/* Reading it is half. Where a practice run covers this guide,
                  the end of the reading is the place to offer the doing. */}
              <div className="mt-14 flex flex-wrap items-center gap-3 border-t border-line/70 pt-6">
                <p className="min-w-[200px] flex-1 text-[15px] font-semibold">
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
          </article>
        </div>

        {/* the picture at full size, over the article rather than a new tab */}
        {zoom ? (
          <div className="absolute inset-0 z-10 flex flex-col bg-page/95 p-3 sm:p-6" onClick={() => setZoom(null)}>
            <div className="flex items-center gap-3 pb-3">
              <p className="min-w-0 flex-1 truncate text-[14px] font-bold">{zoom.title}</p>
              <button type="button" onClick={() => setZoom(null)} className="rounded-full border border-line/80 bg-card px-4 py-1.5 text-[12.5px] font-semibold">
                Back to the guide
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-line/70 bg-card p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={zoom.src} alt={zoom.title} className="mx-auto h-auto max-w-full rounded-xl" />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Section({ s, n, showImage, onZoom }: { s: GuideStep; n: number; showImage: boolean; onZoom: (z: Zoom) => void }) {
  return (
    <section className="mt-12">
      <p className="figures text-[12px] font-semibold text-accent-dark">{String(n).padStart(2, "0")}</p>
      <h2 className="mt-1 text-[22px] font-bold leading-tight sm:text-[24px]">{s.title}</h2>
      <p className={`mt-3 ${PROSE}`}>{s.body}</p>

      {s.image && showImage ? <Figure src={s.image} title={s.title} caption={s.caption} onZoom={onZoom} inColumn /> : null}

      {s.why ? (
        <p className={`mt-4 ${PROSE}`}>
          <span className="font-semibold text-ink">Why it matters. </span>
          {s.why}
        </p>
      ) : null}
      {s.how ? (
        <p className={`mt-4 ${PROSE}`}>
          <span className="font-semibold text-ink">How it works. </span>
          {s.how}
        </p>
      ) : null}
      {s.sends ? (
        <aside className={`mt-5 rounded-2xl px-5 py-4 ${SAGE}`}>
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em]">
            <DoodleIcon name="mail" size={13} />
            What it sends
          </p>
          <p className="mt-1.5 text-[14.5px] leading-relaxed">{s.sends}</p>
        </aside>
      ) : null}
    </section>
  );
}

/**
 * A screenshot in the flow of the text. A little wider than the prose on a
 * large screen, so a whole screen shrunk into it still shows its buttons;
 * capped in height, so a tall crop does not become a wall. Click to enlarge.
 */
function Figure({
  src,
  title,
  caption,
  eager,
  inColumn,
  onZoom,
}: {
  src: string;
  title: string;
  caption?: string;
  eager?: boolean;
  inColumn?: boolean;
  onZoom: (z: Zoom) => void;
}) {
  return (
    <figure className={inColumn ? "my-6 md:-mx-16" : "mx-auto mt-8 max-w-[820px]"}>
      <button
        type="button"
        onClick={() => onZoom({ src, title })}
        className="block w-full overflow-hidden rounded-2xl border border-line/70 bg-card p-2 transition hover:border-ink/30"
        aria-label={`Enlarge: ${title}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={title} className="mx-auto max-h-[520px] w-auto max-w-full rounded-xl" loading={eager ? "eager" : "lazy"} />
      </button>
      {caption ? <figcaption className="mt-2 text-center text-[12.5px] text-muted">{caption}</figcaption> : null}
    </figure>
  );
}
