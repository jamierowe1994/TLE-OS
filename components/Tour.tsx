"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { stepsFor, type TourId, type TourStep } from "@/lib/tour";
import { useSetup } from "@/lib/setup-store";
import { setupFinished } from "@/lib/setup";

/**
 * Showing a new agent round.
 *
 * ── How the spotlight is made ─────────────────────────────────────────────
 *
 * FOUR panels, not one overlay with a hole in it. The obvious way to do this
 * is one full-screen div with a huge `box-shadow` spread, which gives you the
 * dark surround for free - but James asked for the rest of the screen to be
 * BLURRED, and `backdrop-filter` applies to everything behind the element
 * that carries it. A single element with a shadow-hole still blurs the hole.
 *
 * So the surround is drawn as four rectangles - above, below, left and right
 * of the target - and the target's own rectangle simply has nothing over it.
 * Nothing to un-blur, because nothing blurred it.
 *
 * ── Nothing is clicked on anybody's behalf ────────────────────────────────
 *
 * The tour asks the shell to open the rail and asks Steve to open on a tab,
 * through the same window events those components already expose. It does not
 * synthesise clicks and it does not reach into anybody's state. If an anchor
 * cannot be found - the rail does not exist below 1024px, Admin is owner-only
 * - the card is shown centred with no spotlight instead of pointing at a
 * rectangle that is not there.
 */

const CARD_W = 344;
const GAP = 14;

type Box = { top: number; left: number; width: number; height: number };

function visible(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

/** The rectangle to cut out, or null to show the card centred. */
function measure(step: TourStep): Box | null {
  if (!step.target?.length || typeof document === "undefined") return null;

  const els: Element[] = [];
  for (const sel of step.target) {
    const found = Array.from(document.querySelectorAll(sel)).filter(visible);
    if (!found.length) continue;
    if (step.union) els.push(...found);
    else {
      els.push(found[0]);
      break;
    }
  }
  if (!els.length) return null;

  const rects = els.map((e) => e.getBoundingClientRect());
  const top = Math.min(...rects.map((r) => r.top));
  const left = Math.min(...rects.map((r) => r.left));
  const right = Math.max(...rects.map((r) => r.right));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  /* A little air, so the ring sits around the thing rather than on it. */
  const pad = 8;
  return {
    top: top - pad,
    left: left - pad,
    width: right - left + pad * 2,
    height: bottom - top + pad * 2,
  };
}

/** Where the card goes: the side of the hole with room for it. */
function place(box: Box | null, cardH: number): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const centre = {
    top: Math.max(GAP, (vh - cardH) / 2),
    left: Math.max(GAP, (vw - CARD_W) / 2),
  };
  if (!box) return centre;

  const clampX = (x: number) => Math.min(Math.max(GAP, x), vw - CARD_W - GAP);
  const clampY = (y: number) => Math.min(Math.max(GAP, y), vh - cardH - GAP);

  /* Right of the target first: the rail is the most common anchor and it is
     down the left-hand edge, so this is the answer nearly every time. */
  if (box.left + box.width + GAP + CARD_W < vw) {
    return { top: clampY(box.top - 8), left: box.left + box.width + GAP };
  }
  if (box.left - GAP - CARD_W > 0) {
    return { top: clampY(box.top - 8), left: box.left - GAP - CARD_W };
  }
  if (box.top + box.height + GAP + cardH < vh) {
    return { top: box.top + box.height + GAP, left: clampX(box.left) };
  }
  if (box.top - GAP - cardH > 0) {
    return { top: box.top - GAP - cardH, left: clampX(box.left) };
  }
  return centre;
}

export default function Tour({
  /**
   * Offer it immediately and remember nothing.
   *
   * The public preview, where there is no account to record an answer against
   * and no ?tour=choose to arrive with. It also means Susan can run the tour,
   * close it, reload, and run it again - which is what somebody being shown a
   * thing in a meeting actually does.
   */
  preview = false,
}: {
  preview?: boolean;
} = {}) {
  const params = useSearchParams();
  const { view, ready, save } = useSetup(preview);

  const [tour, setTour] = useState<TourId | null>(null);
  const [at, setAt] = useState(0);
  const [choosing, setChoosing] = useState(false);
  const [box, setBox] = useState<Box | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const card = useRef<HTMLDivElement>(null);

  const asked = params.get("tour") === "choose";

  /* Offer it once: either we were sent here by the end of setup, or setup is
     finished and this person has never answered the question. Skipping is an
     answer and is recorded, so it is not asked twice. */
  /* Offered at most once per visit. Without this the effect re-fires the
     moment a tour ends - `tour` goes back to null, the condition is true
     again, and the chooser reopens on top of somebody who just closed it.
     In the signed-in case the saved answer would eventually settle it, but
     only after the write lands, so there is a window where it flickers. */
  const offered = useRef(false);

  useEffect(() => {
    if (!ready || tour || offered.current) return;
    /* Answered once, never asked again - `state.tour` records a skip as much
       as a choice. Keyed off setupFinished for the same reason the gate is:
       a lapsed REX sign-in is not a reason to start somebody's first day
       over. */
    if (preview || asked || (setupFinished(view) && !view.state.tour)) {
      offered.current = true;
      setChoosing(true);
    }
  }, [ready, asked, view, tour, preview]);

  /** Re-run from Steve's Guides shelf. */
  useEffect(() => {
    const again = (e: Event) => {
      const d = (e as CustomEvent).detail as { tour?: TourId } | undefined;
      window.dispatchEvent(new CustomEvent("os-help-dock", { detail: { open: false } }));
      if (d?.tour) {
        setTour(d.tour);
        setAt(0);
        setChoosing(false);
      } else setChoosing(true);
    };
    window.addEventListener("os-tour", again);
    return () => window.removeEventListener("os-tour", again);
  }, []);

  const steps = tour ? stepsFor(tour) : [];
  const step: TourStep | undefined = steps[at];

  /* Ask the shell and Steve to reveal whatever this step points at, BEFORE
     measuring - a rail that is still animating open measures at 72px wide. */
  useEffect(() => {
    if (!step) return;
    if (step.reveal) {
      window.dispatchEvent(new CustomEvent("os-shell", { detail: step.reveal }));
    }
    if (step.dock) {
      window.dispatchEvent(new CustomEvent("os-help-dock", { detail: step.dock }));
    }
  }, [step]);

  const remeasure = useCallback(() => {
    if (!step) return;
    setBox(measure(step));
  }, [step]);

  /* Measured twice on purpose: once now, and once after the rail's 360ms
     open transition and Steve's bubble have finished moving. Measuring only
     once puts the ring where the thing used to be. */
  useEffect(() => {
    if (!step) return;
    remeasure();
    const t1 = window.setTimeout(remeasure, 180);
    const t2 = window.setTimeout(remeasure, 460);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [step, remeasure]);

  useEffect(() => {
    if (!tour) return;
    window.addEventListener("resize", remeasure);
    window.addEventListener("scroll", remeasure, true);
    return () => {
      window.removeEventListener("resize", remeasure);
      window.removeEventListener("scroll", remeasure, true);
    };
  }, [tour, remeasure]);

  /* Position after render, when the card's real height is known. Estimating
     it puts the card half off the bottom of the screen on the long steps. */
  useLayoutEffect(() => {
    if (!step) return;
    const h = card.current?.offsetHeight ?? 220;
    setPos(place(box, h));
  }, [box, step]);

  const finish = useCallback(
    async (how: TourId | "skipped") => {
      setTour(null);
      setAt(0);
      window.dispatchEvent(new CustomEvent("os-help-dock", { detail: { open: false } }));
      window.dispatchEvent(new CustomEvent("os-shell", { detail: { profile: false } }));
      setChoosing(false);
      /* Nothing recorded in the preview - there is no account to record it
         against, and it must stay re-runnable. The preview page keeps a
         "Show me round again" button, which dispatches os-tour. */
      if (!preview) await save({ tour: how === "skipped" ? "skipped" : how });
    },
    [save, preview]
  );

  /* Escape leaves. A full-screen overlay with no way out on the keyboard is
     a trap, and this one covers the whole product. */
  useEffect(() => {
    if (!tour && !choosing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void finish(tour ?? "skipped");
      if (!tour) return;
      if (e.key === "ArrowRight") setAt((i) => Math.min(i + 1, stepsFor(tour).length - 1));
      if (e.key === "ArrowLeft") setAt((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tour, choosing, finish]);

  if (choosing) return <Chooser onPick={(id) => { setTour(id); setAt(0); setChoosing(false); }} onSkip={() => void finish("skipped")} />;
  if (!tour || !step) return null;

  const last = at === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[240]" role="dialog" aria-modal="true" aria-label="Showing you round">
      {/* The surround, in four pieces. The target's rectangle is the gap
          between them, so it is neither dimmed nor blurred. */}
      {box ? (
        <>
          <Panel style={{ top: 0, left: 0, right: 0, height: Math.max(0, box.top) }} />
          <Panel style={{ top: box.top + box.height, left: 0, right: 0, bottom: 0 }} />
          <Panel style={{ top: box.top, left: 0, width: Math.max(0, box.left), height: box.height }} />
          <Panel style={{ top: box.top, left: box.left + box.width, right: 0, height: box.height }} />
          {/* The ring. pointer-events-none so the thing underneath is still
              usable - somebody who wants to click Steve mid-tour should be
              able to. */}
          <div
            className="pointer-events-none absolute rounded-2xl ring-2 ring-accent-dark/70 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ top: box.top, left: box.left, width: box.width, height: box.height }}
          />
        </>
      ) : (
        <Panel style={{ inset: 0 }} />
      )}

      <div
        ref={card}
        className="fade-up absolute w-[344px] max-w-[calc(100vw-28px)] rounded-2xl border border-line/80 bg-panel p-5 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.45)]"
        style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? "visible" : "hidden" }}
      >
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="hand text-[17px] leading-tight">{step.title}</h2>
          <span className="shrink-0 text-[10.5px] text-muted">
            {at + 1} of {steps.length}
          </span>
        </div>

        <p className="mt-2 text-[12.5px] leading-relaxed">{step.body}</p>

        {step.caveat && (
          <p className="mt-3 rounded-xl border border-line/80 bg-box p-3 text-[11.5px] leading-relaxed text-muted">
            {step.caveat}
          </p>
        )}

        <div className="mt-5 flex items-center gap-2">
          <button
            type="button"
            onClick={() => void finish(tour)}
            className="text-[11.5px] text-muted underline transition-colors hover:text-ink"
          >
            {last ? "Close" : "Skip the rest"}
          </button>
          <div className="ml-auto flex items-center gap-2">
            {at > 0 && (
              <button
                type="button"
                onClick={() => setAt((i) => i - 1)}
                className="rounded-full border border-line/80 px-3.5 py-1.5 text-[12px] transition-colors hover:border-ink/40"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={() => (last ? void finish(tour) : setAt((i) => i + 1))}
              className="rounded-full bg-accent-dark px-4 py-1.5 text-[12px] font-semibold text-white"
            >
              {last ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** One piece of the blurred surround. */
function Panel({ style }: { style: React.CSSProperties }) {
  return (
    <div
      className="absolute bg-page/55 backdrop-blur-[3px] transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
      style={style}
    />
  );
}

/**
 * Full, fast, or not now.
 *
 * Skip is a real option rather than a hidden one. Somebody arriving at nine
 * on their first morning with a landlord already waiting should be able to
 * say not now, and the offer stays on Steve's Guides shelf afterwards.
 */
function Chooser({ onPick, onSkip }: { onPick: (id: TourId) => void; onSkip: () => void }) {
  const OPTIONS: { id: TourId; label: string; time: string; blurb: string }[] = [
    {
      id: "full",
      label: "Show me round",
      time: "about two minutes",
      blurb: "Every part of the system, in the order it appears down the side.",
    },
    {
      id: "fast",
      label: "Just the essentials",
      time: "about thirty seconds",
      blurb: "Your assistant, and how to tell us when something is not right.",
    },
  ];

  return (
    <div className="fixed inset-0 z-[240] flex items-center justify-center px-5">
      <div className="absolute inset-0 bg-page/70 backdrop-blur-[3px]" />
      <div className="fade-up relative w-full max-w-md">
        <h2 className="hand text-center text-[24px] leading-tight">Shall we show you round?</h2>
        <p className="mt-2 text-center text-[12.5px] leading-relaxed text-muted">
          You can stop at any point, and pick it up again from Steve in the
          bottom right whenever you like.
        </p>

        <div className="mt-6 flex flex-col gap-2.5">
          {OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => onPick(o.id)}
              /* Shadowed like the step card. Without it these sat on a blurred
                 scrim of nearly their own colour and read as flat rectangles
                 in the dark theme, where --panel and --page are one step
                 apart. The shadow, not the border, is what lifts them off. */
              className="block-pop rounded-2xl border border-line/80 bg-panel p-4 text-left shadow-[0_18px_44px_-18px_rgba(0,0,0,0.5)]"
            >
              <div className="flex items-baseline gap-2">
                <span className="hand text-[15px]">{o.label}</span>
                <span className="text-[10.5px] text-muted">{o.time}</span>
                <span className="ml-auto text-muted">→</span>
              </div>
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted">{o.blurb}</p>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onSkip}
          className="mx-auto mt-4 block text-[11.5px] text-muted underline transition-colors hover:text-ink"
        >
          Not now, take me to my dashboard
        </button>
      </div>
    </div>
  );
}
