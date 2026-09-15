"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

/**
 * Two decks, one slide, side by side.
 *
 * The bar is the whole interface: which slide, which deck kind, and whether
 * the frames are stacked or beside each other. Everything else is the two
 * frames, because the point of the page is to read the slides rather than the
 * page around them.
 *
 * Stepping reloads both frames (see the note on app/present/compare/page.tsx —
 * they are different origins and cannot be scripted from here), so the keys
 * are bound to Link navigation rather than to anything clever.
 */

type Slide = { id: string; title: string };

const BTN =
  "inline-flex items-center justify-center rounded-md border border-line/70 bg-white px-3 py-1.5 text-[12.5px] font-semibold transition-colors hover:border-ink/40 disabled:cursor-not-allowed disabled:opacity-35";

export default function CompareHarness({
  slides,
  index,
  kind,
  kinds,
  beforeOrigin,
}: {
  slides: Slide[];
  index: number;
  kind: string;
  kinds: { id: string; label: string }[];
  beforeOrigin: string;
}) {
  const [stacked, setStacked] = useState(false);
  /* The before server is a second `next dev` on this machine and is quite
     often simply not running. Saying so beats an empty white frame that
     looks like the old deck rendered nothing. */
  const [beforeUp, setBeforeUp] = useState<"checking" | "up" | "down">("checking");

  useEffect(() => {
    let live = true;
    /* no-cors: we cannot read the response and do not need to. It either
       resolves, which means something is listening, or it throws. */
    fetch(`${beforeOrigin}/present/sample`, { mode: "no-cors" })
      .then(() => live && setBeforeUp("up"))
      .catch(() => live && setBeforeUp("down"));
    return () => {
      live = false;
    };
  }, [beforeOrigin]);

  const href = useCallback(
    (i: number) => `/present/compare?kind=${kind}&at=${i}&before=${encodeURIComponent(beforeOrigin)}`,
    [kind, beforeOrigin]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el && (el.tagName === "SELECT" || el.tagName === "INPUT")) return;
      if (e.key === "ArrowRight" && index < slides.length - 1) location.href = href(index + 1);
      if (e.key === "ArrowLeft" && index > 0) location.href = href(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, slides.length, href]);

  const here = slides[index];
  const src = (origin: string) =>
    `${origin}/present/sample?kind=${kind}&embed=1&at=${index}`;

  return (
    <div className="flex h-[100dvh] flex-col bg-[#f4f2f0]">
      {/* ── the bar ── */}
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-line/70 bg-white px-4 py-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Before / after</span>

        <span className="flex items-center gap-1.5">
          <Link href={href(Math.max(index - 1, 0))} className={BTN} aria-disabled={index === 0}>
            ←
          </Link>
          <Link
            href={href(Math.min(index + 1, slides.length - 1))}
            className={BTN}
            aria-disabled={index === slides.length - 1}
          >
            →
          </Link>
        </span>

        <select
          value={index}
          onChange={(e) => {
            location.href = href(Number(e.target.value));
          }}
          className="max-w-[260px] rounded-md border border-line/70 bg-white px-2.5 py-1.5 text-[13px]"
        >
          {slides.map((s, i) => (
            <option key={s.id} value={i}>
              {String(i + 1).padStart(2, "0")} · {s.title}
            </option>
          ))}
        </select>

        <span className="text-[12.5px] tabular-nums text-muted">
          {index + 1} of {slides.length}
        </span>

        <span className="flex items-center gap-1.5">
          {kinds.map((k) => (
            <Link
              key={k.id}
              href={`/present/compare?kind=${k.id}&at=0&before=${encodeURIComponent(beforeOrigin)}`}
              className={`rounded-full px-3 py-1 text-[12px] font-semibold transition-colors ${
                k.id === kind ? "bg-ink text-white" : "border border-line/70 bg-white hover:border-ink/40"
              }`}
            >
              {k.label}
            </Link>
          ))}
        </span>

        <button type="button" className={`${BTN} ml-auto`} onClick={() => setStacked((s) => !s)}>
          {stacked ? "Side by side" : "Stack"}
        </button>

        <span
          className="text-[12px] text-muted"
          title={beforeOrigin}
        >
          before:{" "}
          {beforeUp === "up" ? (
            <b className="font-semibold text-[#56634a]">running</b>
          ) : beforeUp === "down" ? (
            <b className="font-semibold text-[#b4453a]">not running</b>
          ) : (
            "checking…"
          )}
        </span>
      </header>

      {/* ── the two decks ── */}
      <div className={`grid min-h-0 flex-1 gap-2 p-2 ${stacked ? "grid-rows-2" : "grid-cols-2"}`}>
        <Pane
          label="Before"
          sub="pre-rewrite commit"
          tone="#8d8481"
          src={beforeUp === "down" ? null : src(beforeOrigin)}
          note={
            beforeUp === "down" ? (
              <>
                Nothing is listening on <code className="font-mono">{beforeOrigin}</code>. Start the
                before-server, then reload this page.
              </>
            ) : null
          }
        />
        <Pane label="After" sub="what is in the tree now" tone="#56423e" src={src("")} note={null} />
      </div>

      <footer className="shrink-0 border-t border-line/70 bg-white px-4 py-1.5 text-[11.5px] text-muted">
        <span className="font-semibold text-ink">{here?.title}</span> · ← and → step both decks ·
        each step reloads the frames, which is why it is not instant
      </footer>
    </div>
  );
}

function Pane({
  label,
  sub,
  tone,
  src,
  note,
}: {
  label: string;
  sub: string;
  tone: string;
  src: string | null;
  note: React.ReactNode;
}) {
  return (
    <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-line/70 bg-white">
      <div className="flex shrink-0 items-baseline gap-2 border-b border-line/60 px-3 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: tone }}>
          {label}
        </span>
        <span className="text-[11.5px] text-muted">{sub}</span>
      </div>
      {src ? (
        <iframe
          key={src}
          src={src}
          title={label}
          className="min-h-0 w-full flex-1 border-0"
          /* The frames are two dev servers on this machine showing the sample
             deck. Nothing in them needs to reach out or be reached. */
          sandbox="allow-scripts allow-same-origin"
        />
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center p-8 text-center text-[13px] leading-relaxed text-muted">
          {note}
        </div>
      )}
    </section>
  );
}
