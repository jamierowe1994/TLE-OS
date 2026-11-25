"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import DoodleIcon from "@/components/DoodleIcon";
import type { Guide, GuideStep } from "@/lib/guide-types";

/**
 * A guide in the house style (the "guides" switch, lib/new-look).
 *
 * James, 25 Nov 2026: "make sure it's in the new style ... make it nice and
 * super readable, super easy to get your head around." Same guide, same words
 * as components/GuideModal; only the page around them changes. One square
 * white sheet over a darkened page, the title in the condensed capitals, The
 * Short Version first for anybody who reads nothing else, then each step
 * numbered, in a larger serif, with its picture in a fine square frame. Why
 * and how are small labelled paragraphs so the eye can skip them; what it
 * sends sits in the sage panel because the agent can't see it from their
 * own screen.
 *
 * Styles: app/new-look/guide.css (nl-gd-).
 */

type Zoom = { src: string; title: string };

export default function GuideSheet({ g, onClose }: { g: Guide; onClose: () => void }) {
  const path = usePathname();
  const scroller = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [zoom, setZoom] = useState<Zoom | null>(null);

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
    <div data-look="new" className="nl-gd-wrap" onClick={onClose}>
      <div className="nl-gd-scrim" aria-hidden />
      <div className="nl-gd" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={g.title}>
        <div className="nl-gd-bar">
          <span className="nl-gd-bar-k">Guide</span>
          <p className="nl-gd-bar-t">{g.title}</p>
          {!onTheScreen ? (
            <Link href={g.href} onClick={onClose} className="nl-gd-btn is-line nl-gd-bar-open">
              Open the Screen
            </Link>
          ) : null}
          <button type="button" onClick={onClose} aria-label="Close" className="nl-gd-x">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="square" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
          <span aria-hidden className="nl-gd-prog" style={{ transform: `scaleX(${progress})` }} />
        </div>

        <div ref={scroller} onScroll={onScroll} className="nl-gd-scroll">
          <article className="nl-gd-art">
            <header className="nl-gd-head">
              <p className="nl-gd-eyebrow">
                <DoodleIcon name={g.icon} size={13} />
                {g.minutes} Min Read
              </p>
              <h1 className="nl-gd-title">{g.title}</h1>
              <p className="nl-gd-blurb">{g.blurb}</p>
            </header>

            {g.short?.length ? (
              <aside className="nl-gd-short" aria-label="The short version">
                <p className="nl-gd-label">The Short Version</p>
                <ol>
                  {g.short.map((line, i) => (
                    <li key={i}>
                      <span className="nl-gd-short-n">{i + 1}</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ol>
              </aside>
            ) : null}

            {cover ? (
              <Figure
                src={cover}
                title={g.title}
                caption={g.coverCaption ?? (coverIsFirstStep ? g.steps[0].caption : undefined)}
                eager
                wide
                onZoom={setZoom}
              />
            ) : null}

            {g.intro ? <p className="nl-gd-p nl-gd-intro">{g.intro}</p> : null}

            {g.steps.map((s, i) => (
              <Step key={s.title} s={s} n={i + 1} showImage={!(i === 0 && coverIsFirstStep)} onZoom={setZoom} />
            ))}

            <footer className="nl-gd-end">
              <p>{g.practice ? "That's the whole of it. Now try it for real." : "That's the whole of it."}</p>
              <div className="nl-gd-end-acts">
                {g.practice ? (
                  <Link href={g.practice.href} onClick={onClose} className="nl-gd-btn">
                    {g.practice.label}
                  </Link>
                ) : null}
                {!onTheScreen ? (
                  <Link href={g.href} onClick={onClose} className={`nl-gd-btn${g.practice ? " is-line" : ""}`}>
                    Open the Screen
                  </Link>
                ) : null}
                <button type="button" onClick={onClose} className="nl-gd-btn is-line">
                  Close
                </button>
              </div>
            </footer>
          </article>
        </div>

        {zoom ? (
          <div className="nl-gd-zoom" onClick={() => setZoom(null)}>
            <div className="nl-gd-zoom-bar">
              <p>{zoom.title}</p>
              <button type="button" onClick={() => setZoom(null)} className="nl-gd-btn is-line">
                Back to the Guide
              </button>
            </div>
            <div className="nl-gd-zoom-pic">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={zoom.src} alt={zoom.title} />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Step({ s, n, showImage, onZoom }: { s: GuideStep; n: number; showImage: boolean; onZoom: (z: Zoom) => void }) {
  return (
    <section className="nl-gd-step">
      <div className="nl-gd-step-h">
        <span className="nl-gd-n">{String(n).padStart(2, "0")}</span>
        <h2>{s.title}</h2>
      </div>
      <p className="nl-gd-p">{s.body}</p>

      {s.image && showImage ? <Figure src={s.image} title={s.title} caption={s.caption} onZoom={onZoom} /> : null}

      {s.why ? (
        <div className="nl-gd-note">
          <p className="nl-gd-label">Why It Matters</p>
          <p className="nl-gd-p is-small">{s.why}</p>
        </div>
      ) : null}
      {s.how ? (
        <div className="nl-gd-note">
          <p className="nl-gd-label">How It Works</p>
          <p className="nl-gd-p is-small">{s.how}</p>
        </div>
      ) : null}
      {s.sends ? (
        <aside className="nl-gd-sends">
          <p className="nl-gd-label">
            <DoodleIcon name="mail" size={13} />
            What It Sends
          </p>
          <p>{s.sends}</p>
        </aside>
      ) : null}
    </section>
  );
}

function Figure({
  src,
  title,
  caption,
  eager,
  wide,
  onZoom,
}: {
  src: string;
  title: string;
  caption?: string;
  eager?: boolean;
  wide?: boolean;
  onZoom: (z: Zoom) => void;
}) {
  return (
    <figure className={`nl-gd-fig${wide ? " is-wide" : ""}`}>
      <button type="button" onClick={() => onZoom({ src, title })} aria-label={`Enlarge: ${title}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={title} loading={eager ? "eager" : "lazy"} />
      </button>
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}
